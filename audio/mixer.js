import { Track } from './track.js';
import { StagedTrack } from './stage.js';

/**
 * An Channel is like a stateful StagedTrack. The key difference
 * between the two is the StagedTrack holds a reference to the track in the
 * track library so that when you change track information the StagedTracks
 * do not need to be updated. An Channel contains all the information
 * needed to play a channel. Making it the object we want to send over the wire.
 */
class Channel {
    /**
     * The track name
     * @type {string}
     */
    name;

    /**
     * The track source
     * @type {string}
     */
    src;

    /**
     * The current channel volume
     * @type {number}
     */
    volume = 1;

    /**
     * Loop this track
     * @type {boolean}
     */
    loop = false;

    /**
     * Is this channel paused
     * @type {boolean}
     */
    paused = false;

    /**
     * @param {Track} track
     * @param {StagedTrack} stagedTrack
     */
    constructor(track, stagedTrack) {
        this.name = track.name;
        this.src = track.src;
        this.volume = stagedTrack.volume;
        this.loop = stagedTrack.loop;
        this.paused = !stagedTrack.autoplay;
    }

    /**
     * @static
     * @param {any} obj
     * @return {Channel}
     */
    static assign(obj) {
        return Object.assign(new Channel(), obj)
    }
}

/**
 * MixerState is the stateful representation of the mixer. Audio players are not
 * stateful and can not be transmitted over a wire so this object holds all the
 * current state of the mixer so that it can be easily be saved to local storage
 * and sent over the message bus to sync other mixers.
 */
class MixerState {
    /**
     * The current master volume
     * @type {number}
     */
    volume = .5

    /**
     * If we are currently paused
     * @type {boolean}
     */
    paused = false;

    /**
     * A dictionary of channels currently in the mixer
     * @type {Object.<string, Channel>}
     */
    channels = {};

    /**
     * @static
     * @param {*} obj
     * @returns {MixerState}
     */
    static assign(obj) {
        // rehydrate channels
        const channels = {}
        Object.entries(obj.channels ?? {}).forEach(([id, channel]) =>
            channels[id] = Channel.assign(channel));
        delete obj.channels;

        // deserialize the rest
        const state = new MixerState;
        state.channels = channels
        return Object.assign(state, obj)
    }
}

/**
 * The Mixers is responsible for mixing together and controlling the play/pause
 * state of the various Channels and controlling the master volume. Mixer state
 * is persisted to local storage, so browser refreshes are not disruptive.
 */
class Mixer {
    /**
     * A map of the current Audio players
     * @private
     * @type {Object.<string, HTMLAudioElement}
     */
    _players = {};

    /**
     * The the local storage key used for persisting MixerState to local storage
     * @private
     * @type {string}
     */
    _localStorageKey;

    /**
     * The gameID is required for persisting mixer state
     * @param {string} gameID
     */
    constructor(gameID) {
        this._localStorageKey = `audio.mixer.${gameID}`;
    }

    /**
     * @private
     * Syncs the mixer state from local storage into native Audio object
     */
    _syncPlayers() {
        const state = this.state();

        // create and update players
        Object.entries(state.channels).forEach(([id, channel]) => {
            let player = this._players[id]

            // create new player if needed
            if (!(player)) {
                player = new Audio();
                player.preload = "auto";
                this._players[id] = player;
            }

            // sync player
            player.src = channel.src;
            player.volume = state.volume * channel.volume;
            player.loop = channel.loop;
            if (state.paused || channel.paused) {
                player.pause();
            } else {
                player.play();
            }
        });

        // delete players that no longer have a channel associated with them
        Object.entries(this._players).forEach(([id, player]) => {
            if (!(id in state.channels)) {
                player.pause();
                delete this._players[id];
            }
        });
    }

    /**
     * Save mixer state to local storage and sync
     * @private
     * @param {MixerState} state
     */
    _write(state) {
        localStorage.setItem(this._localStorageKey, JSON.stringify(state));
        this._syncPlayers;
    }

    /**
     * Returns the mixer state from local storage
     * @returns {MixerState}
     */
    state() {
        return MixerState.assign(JSON.parse(localStorage.getItem(this._localStorageKey) ?? "{}"));
    }

    /**
     * Set the master volume
     * @type {number}
     */
    set volume(v) {
        const state = this.state();
        state.volume = v;
        this._write(state);
    }

    /**
     * Gets teh current master volume
     * @type {number}
     */
    get volume() {
        return this.state().volume;
    }

    /**
     * Plays the mixer. Only channels that are set to playing will play.
     */
    play() {
        const state = this.state();
        state.paused = false;
        this._write(state);
    }

    /**
     * Pauses the mixer
     */
    pause() {
        const state = this.state();
        state.paused = true;
        this._write(state);
    }
}


const mixer = new Mixer($("#message-broker-client").attr("data-gameId"));

export { Channel, mixer };