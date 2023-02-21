
$(function() {
    window.diceRoller = new DiceRoller();
});

const allDiceRegex = /\d+d(?:100|20|12|10|8|6|4)(?:kh\d+|kl\d+|ro(<|<=|>|>=|=)\d+)*/g; // ([numbers]d[diceTypes]kh[numbers] or [numbers]d[diceTypes]kl[numbers]) or [numbers]d[diceTypes]
const validExpressionRegex = /^[dkhlro<=>\s\d+\-\(\)]*$/g; // any of these [d, kh, kl, spaces, numbers, +, -] // Should we support [*, /] ?
const validModifierSubstitutions = /(?<!\w)(str|dex|con|int|wis|cha|pb)(?!\w)/gi // case-insensitive shorthand for stat modifiers as long as there are no letters before or after the match. For example `int` and `STR` would match, but `mint` or `strong` would not match.
const diceRollCommandRegex = /^\/(r|roll|save|hit|dmg|skill|heal)\s/; // matches only the slash command. EG: `/r 1d20` would only match `/r`
const multiDiceRollCommandRegex = /\/(r|roll|save|hit|dmg|skill|heal) [^\/]*/g; // globally matches the full command. EG: `note: /r 1d20 /r2d4` would find ['/r 1d20', '/r2d4']
const allowedExpressionCharactersRegex = /^(\d+d\d+|kh\d+|kl\d+|ro(<|<=|>|>=|=)\d+|\+|-|\d+|\s+|STR|str|DEX|dex|CON|con|INT|int|WIS|wis|CHA|cha|PB|pb)*/; // this is explicitly different from validExpressionRegex. This matches an expression at the beginning of a string while validExpressionRegex requires the entire string to match. It is also explicitly declaring the modifiers as case-sensitive because we can't search the entire thing as case-insensitive because the `d` in 1d20 needs to be lowercase.

class DiceRoll {
    // `${action}: ${rollType}` is how the gamelog message is displayed

    // don't allow changing these. They can only be set from within the constructor.
    #fullExpression = "";
    get expression() { return this.#fullExpression; }

    #individualDiceExpressions = [];
    get diceExpressions() { return this.#individualDiceExpressions; }

    #calculatedExpressionConstant = 0;
    get calculatedConstant() { return this.#calculatedExpressionConstant; }

    #separatedDiceToRoll = {};
    get diceToRoll() { return this.#separatedDiceToRoll; }

    // these can be changed after the object is constructed.

    #diceAction;        // "Rapier", "Fire Bolt", etc. defaults to "custom"
    get action() { return this.#diceAction }
    set action(newAction) {
        if (typeof newAction !== "string" || (/^\s*$/).test(newAction)) { // any empty strings or strings with only whitespace should be set to undefined
            this.#diceAction = undefined;
        } else {
            this.#diceAction = newAction.trim();
        }
    }
    #diceRollType; // "To Hit", "Damage", etc. defaults to "roll"
    get rollType() { return this.#diceRollType }
    set rollType(newRollType) {
        if (typeof newRollType !== "string") {
            this.#diceRollType = undefined;
            return;
        }
        try {
            let alteredRollType = newRollType.trim().toLowerCase().replace("-", " ");
            const validRollTypes = ["to hit", "damage", "save", "check", "heal", "reroll"];
            if (validRollTypes.includes(alteredRollType)) {
                this.#diceRollType = alteredRollType;
            } else {
                console.warn(`not setting rollType. Expected one of ${JSON.stringify(validRollTypes)}, but received "${newRollType}"`);
            }
        } catch (error) {
            console.warn("DiceRoll set rollType failed", error);
            this.#diceRollType = undefined;
        }
    }

    name;       // monster name, player name, etc.
    avatarUrl;  // the url of the image to render in the gamelog message

    entityType; // "character", "monster", etc
    entityId;   // the id of the character, monster, etc

    #sendTo;     // "Self", "Everyone", undefined.
    get sendToOverride() { return this.#sendTo }
    set sendToOverride(newValue) {
        if (["Self", "Everyone", "DungeonMaster"].includes(newValue)) {
            this.#sendTo = newValue;
        } else {
            this.#sendTo = undefined;
        }
    }


    // DDB parses the object after we give it back to them.
    // expressions that are more complex tend to have incorrect expressions displayed because DDB handles that.
    // We need to adjust the outgoing message according to how we expect DDB to parse it
    isComplex() {
        if (this.diceExpressions.length !== 1) {
            return true; // more than 1 expression messes with the parsing that DDB does
        }

        if (this.expression.includes("ro")) {
            return true; // reroll requires us to roll double the amount of dice, but then strip half the results based on the specified reroll rule
        }

        if (this.expression.indexOf(this.diceExpressions[0]) !== 0) {
            return true; // 1-1d4 messes with the parsing that DDB does, but 1d4-1 is just fine
        }

        let advantageMatch = this.diceExpressions[0].match(/kh\d+/g);
        if (advantageMatch?.length > 1 || (advantageMatch?.length === 1 && !this.diceExpressions[0].endsWith("kh1"))) {
            // anything other than kh1 is complex. Such as kh10 or kh2
            return true;
        }
        let disAdvantageMatch = this.diceExpressions[0].match(/kl\d+/g);
        if (disAdvantageMatch?.length > 1 || (disAdvantageMatch?.length === 1 && !this.diceExpressions[0].endsWith("kl1"))) {
            // anything other than kl1 is complex. Such as kl10 or kl2
            return true;
        }

        // not sure what else to look for yet, but this appears to be something like "1d20", "1d20-1", "2d20kh1+3". all of which are correctly parsed by DDB
        return false;
    }

    isAdvantage() {
        return !this.isComplex() && this.expression.startsWith("2d") && this.diceExpressions[0].endsWith("kh1");
    }

    isDisadvantage() {
        return !this.isComplex() && this.expression.startsWith("2d") && this.diceExpressions[0].endsWith("kl1");
    }

    /**
     *
     * @param expression {string} dice expression to parse and roll. EG: "1d20+4". This is the only required value
     * @param action {string|undefined} the action this roll represents. EG: "Rapier", "Fire Bolt", "dex", etc. defaults to "custom"
     * @param rollType {string|undefined} the type of roll this is. EG: "to hit", "damage", "save" etc. defaults to "roll"
     * @param name {string|undefined} the name of the creature/player associated with this roll. This is displayed above the roll box in the gamelog. The character sheet defaults to the PC.name, the encounters page defaults to ""
     * @param avatarUrl {string|undefined} the url for the image to be displayed in the gamelog. This is displayed to the left of the roll box in the gamelog. The character sheet defaults to the PC.avatar, the encounters page defaults to ""
     * @param entityType {string|undefined} the type of entity associated with this roll. EG: "character", "monster", "user" etc. Generic rolls from the character sheet defaults to "character", generic rolls from the encounters page defaults to "user"
     * @param entityId {string|undefined} the id of the entity associated with this roll. If {entityType} is "character" this should be the id for that character. If {entityType} is "monster" this should be the id for that monster. If {entityType} is "user" this should be the id for that user.
     * @param sendToOverride {string|undefined} if undefined, the roll will go to whatever the gamelog is set to.
     */
    constructor(expression, action = undefined, rollType = undefined, name = undefined, avatarUrl = undefined, entityType = undefined, entityId = undefined, sendToOverride = undefined) {

        let parsedExpression = expression.replaceAll(/\s+/g, ""); // remove all spaces
        if (!parsedExpression.match(validExpressionRegex)) {
            console.warn("Not parsing expression because it contains an invalid character", expression);
            throw "Invalid Expression";
        }

        // find all dice expressions in the expression. converts "1d20+1d4" to ["1d20", "1d4"]
        let separateDiceExpressions = parsedExpression.match(allDiceRegex)
        if (!separateDiceExpressions) {
            console.warn("Not parsing expression because there are no valid dice expressions within it", expression);
            throw "Invalid Expression";
        }

        this.#fullExpression = parsedExpression;
        this.#individualDiceExpressions = separateDiceExpressions;

        this.action = action;
        this.rollType = rollType;
        this.sendToOverride = sendToOverride;
        if (name) this.name = name;
        if (avatarUrl) this.avatarUrl = avatarUrl;
        if (entityType) this.entityType = entityType;
        if (entityId) this.entityId = entityId;

        // figure out what constants we need to add or subtract. For example 1d20+4 has a constant of +4. 1d20+1+1d4-3 has a constant of -2/
        let strippedExpression = this.expression.toString() // make sure we use a copy of it
        this.#individualDiceExpressions.forEach(diceExpression => {
            strippedExpression = strippedExpression.replace(diceExpression, "");
        });
        let constantEquation = strippedExpression
            .match(/[+\-]\d+/g) // find any numbers preceded by [+, -] // Should we support [*, /] ?
            ?.reduce((total, current) => total + current); // combine anything we find into a single string; ex: "-2+3"
        if (constantEquation) {
            let calculatedConstant = parseInt(eval(constantEquation.toString())); // execute the equation to get a single number
            if (!isNaN(calculatedConstant)) {
                this.#calculatedExpressionConstant = calculatedConstant;
            }
        }

        // figure out how many of each DiceType we need to roll
        this.#individualDiceExpressions.forEach(diceExpression => {
            let diceType = diceExpression.match(/d\d+/g);
            let numberOfDice = parseInt(diceExpression.split("d")[0]);
            if (diceExpression.includes("ro")) {
                console.debug("diceExpression: ", diceExpression, ", includes reroll so we're doubling the number of dice for", diceType, ", numberOfDice before doubling: ", numberOfDice);
                numberOfDice = numberOfDice * 2;
            }
            console.debug("diceExpression: ", diceExpression, ", diceType: ", diceType, ", numberOfDice: ", numberOfDice);
            if (this.#separatedDiceToRoll[diceType] === undefined) {
                this.#separatedDiceToRoll[diceType] = numberOfDice;
            } else {
                this.#separatedDiceToRoll[diceType] += numberOfDice;
            }
        });
    }

    /**
     * @param slashCommandText {string} the slash command to parse and roll. EG: "/hit 2d20kh1+4 Shortsword". This is the only required value
     * @param name {string|undefined} the name of the creature/player associated with this roll. This is displayed above the roll box in the gamelog. The character sheet defaults to the PC.name, the encounters page defaults to ""
     * @param avatarUrl {string|undefined} the url for the image to be displayed in the gamelog. This is displayed to the left of the roll box in the gamelog. The character sheet defaults to the PC.avatar, the encounters page defaults to ""
     * @param entityType {string|undefined} the type of entity associated with this roll. EG: "character", "monster", "user" etc. Generic rolls from the character sheet defaults to "character", generic rolls from the encounters page defaults to "user"
     * @param entityId {string|undefined} the id of the entity associated with this roll. If {entityType} is "character" this should be the id for that character. If {entityType} is "monster" this should be the id for that monster. If {entityType} is "user" this should be the id for that user.
     * @param sendToOverride {string|undefined} if undefined, the roll will go to whatever the gamelog is set to.
     */
    static fromSlashCommand(slashCommandText, name = undefined, avatarUrl = undefined, entityType = undefined, entityId = undefined, sendToOverride = undefined) {
        let modifiedSlashCommand = replaceModifiersInSlashCommand(slashCommandText);
        let slashCommand = modifiedSlashCommand.match(diceRollCommandRegex)?.[0];
        let expression = modifiedSlashCommand.replace(diceRollCommandRegex, "").match(allowedExpressionCharactersRegex)?.[0];
        let action = modifiedSlashCommand.replace(diceRollCommandRegex, "").replace(allowedExpressionCharactersRegex, "");
        console.debug("DiceRoll.fromSlashCommand text: ", slashCommandText, ", slashCommand:", slashCommand, ", expression: ", expression, ", action: ", action);
        let rollType = undefined;
        if (slashCommand.startsWith("/r")) {
            // /r and /roll allow users to set both the action and the rollType by separating them with `:` so try to parse that out
            [action, rollType] = action.split(":") || [undefined, undefined];
        } else if (slashCommand.startsWith("/hit")) {
            rollType = "to hit";
        } else if (slashCommand.startsWith("/dmg")) {
            rollType = "damage";
        } else if (slashCommand.startsWith("/skill")) {
            rollType = "check";
        } else if (slashCommand.startsWith("/save")) {
            rollType = "save";
        } else if (slashCommand.startsWith("/heal")) {
            rollType = "heal";
        }
        return new DiceRoll(expression, action, rollType, name, avatarUrl, entityType, entityId, sendToOverride);
    }
}

class DiceRoller {

    timeoutDuration = 10000; // 10 second timeout seems reasonable. If the message gets dropped we don't want to be stuck waiting forever.

    /// PRIVATE VARIABLES
    #pendingDiceRoll = undefined;
    #pendingMessage = undefined;
    #timeoutId = undefined;

    /** @returns {boolean} true if a roll has been or will be initiated, and we're actively waiting for DDB messages to come in so we can parse them */
    get #waitingForRoll() {
        // we're about to roll dice so we need to know if we should capture DDB messages.
        // This also blocks other attempts to roll until we've finished processing
        return this.#timeoutId !== undefined;
    }

    constructor() {
        const key = Symbol.for('@dndbeyond/message-broker-lib');
        if (key) {
            this.ddbMB = window[key];
        } else {
            console.warn("DiceRoller failed to get Symbol.for('@dndbeyond/message-broker-lib')");
        }
        if (this.ddbMB) {
            // wrap the original dispatch function so we can block messages when we need to
            this.ddbDispatch = this.ddbMB.dispatch.bind(this.ddbMB);
            this.ddbMB.dispatch = this.#wrappedDispatch.bind(this);
        } else {
            console.warn("DiceRoller failed to get ddbMB");
        }
    }

    /// PUBLIC FUNCTIONS

    /**
     * Attempts to roll DDB dice.
     * If dice are rolled, the results will be processed to make sure the expression is properly calculated.
     * @param diceRoll {DiceRoll} the dice expression to parse and roll. EG: 1d20+4
     * @returns {boolean} whether or not dice were rolled
     */
    roll(diceRoll) {
        try {
            if (diceRoll === undefined || diceRoll.expression === undefined || diceRoll.expression.length === 0) {
                console.warn("DiceRoller.parseAndRoll received an invalid diceRoll object", diceRoll);
                return false;
            }

            if (is_abovevtt_page() && get_avtt_setting_value("bypassDdbDice")) {
                const sentAsDiceRoll = send_rpg_dice_to_ddb(
                  diceRoll.expression,
                  diceRoll.name ? diceRoll.name : window.PLAYER_NAME,
                  diceRoll.avatarUrl ? diceRoll.avatarUrl : window.PLAYER_IMG,
                  diceRoll.rollType,
                  diceRoll.action,
                  diceRoll.sendToOverride
                );
                if (sentAsDiceRoll === true) return true;
                return send_rpg_dice_output_as_chat_message(diceRoll.expression, diceRoll.sendToOverride === "DungeonMaster");
            }

            if (this.#waitingForRoll) {
                console.warn("parseAndRoll called while we were waiting for another roll to finish up");
                return false;
            }

            console.group("DiceRoller.parseAndRoll");
            console.log("attempting to parse diceRoll", diceRoll);

            this.#resetVariables();

            // we're about to roll dice so we need to know if we should capture DDB messages.
            // This also blocks other attempts to roll until we've finished processing
            let self = this;
            this.#timeoutId = setTimeout(function () {
                console.warn("DiceRoller timed out after 10 seconds!");
                self.#resetVariables();
            }, this.timeoutDuration);

            // don't hold a reference to the object we were given in case it gets altered while we're waiting.
            this.#pendingDiceRoll = new DiceRoll(diceRoll.expression, diceRoll.action, diceRoll.rollType, diceRoll.name, diceRoll.avatarUrl, diceRoll.entityType, diceRoll.entityId);

            this.clickDiceButtons(diceRoll);
            console.groupEnd();
            return true;
        } catch (error) {
            console.warn("failed to parse and send expression as DDB roll; expression: ", diceRoll, error);
            this.#resetVariables();
            console.groupEnd();
            return false;
        }
    }

    /**
     * clicks the DDB dice and then clicks the roll button
     * @param diceRoll {DiceRoll} the DiceRoll object to roll
     */
    clickDiceButtons(diceRoll) {

        if (diceRoll === undefined) {
            console.warn("clickDiceButtons was called without a diceRoll object")
            return;
        }

        if ($(".dice-toolbar").hasClass("rollable")) {
            // clear any that are already selected so we don't roll too many dice
            $(".dice-toolbar__dropdown-die").click();
        }

        if ($(".dice-toolbar__dropdown").length > 0) {
            if (!$(".dice-toolbar__dropdown").hasClass("dice-toolbar__dropdown-selected")) {
                // make sure it's open
                $(".dice-toolbar__dropdown-die").click();
            }
            for(let diceType in diceRoll.diceToRoll) {
                let numberOfDice = diceRoll.diceToRoll[diceType];
                for (let i = 0; i < numberOfDice; i++) {
                    $(`.dice-die-button[data-dice='${diceType}']`).click();
                }
            }
        }

        if ($(".dice-toolbar").hasClass("rollable")) {
            console.log("diceRoll.sendToOverride", diceRoll.sendToOverride)
            if (diceRoll.sendToOverride === "Everyone") {
                // expand the options and click the "Everyone" button
                $(".dice-toolbar__target-menu-button").click();
                $("#options-menu ul > li > ul > div").eq(0).click();
            } else if (diceRoll.sendToOverride === "Self") {
                // expand the options and click the "Self" button
                $(".dice-toolbar__target-menu-button").click();
                $("#options-menu ul > li > ul > div").eq(1).click();
            } else if (diceRoll.sendToOverride === "DungeonMaster") {
                // expand the options and click the "Self" button
                $(".dice-toolbar__target-menu-button").click();
                $("#options-menu ul > li > ul > div").eq(2).click();
            } else {
                // click the roll button which will use whatever the gamelog is set to roll to
                $(".dice-toolbar__target").children().first().click();
            }
        }
    }

    /// PRIVATE FUNCTIONS

    /** reset all variables back to their default values */
    #resetVariables() {
        console.log("resetting local variables");
        clearTimeout(this.#timeoutId);
        this.#timeoutId = undefined;
        this.#pendingMessage = undefined;
        this.#pendingDiceRoll = undefined;
    }

    /** wraps all messages that are sent by DDB, and processes any that we need to process, else passes it along as-is */
    #wrappedDispatch(message) {
        console.group("DiceRoller.#wrappedDispatch");
        if (!this.#waitingForRoll) {
            if (is_abovevtt_page() && get_avtt_setting_value("bypassDdbDice")) {
                var successfullyHijackedRoll = false;
                message.data.rolls.forEach(r => {
                    console.log("hijack this expression", r.diceNotationStr);
                    successfullyHijackedRoll = true;
                    const button = $()


                });
                if (successfullyHijackedRoll) {
                    return;
                }

                // const sentAsDiceRoll = send_rpg_dice_to_ddb(
                //   diceRoll.expression,
                //   diceRoll.name ? diceRoll.name : window.PLAYER_NAME,
                //   diceRoll.avatarUrl ? diceRoll.avatarUrl : window.PLAYER_IMG,
                //   diceRoll.rollType,
                //   diceRoll.action,
                //   diceRoll.sendToOverride
                // );
                // if (sentAsDiceRoll === true) return true;
                // return send_rpg_dice_output_as_chat_message(diceRoll.expression, diceRoll.sendToOverride === "DungeonMaster");
            }
            console.debug("not capturing: ", message);
            this.ddbDispatch(message);
        } else if (message.eventType === "dice/roll/pending") {
            console.log("capturing pending message: ", message);
            let ddbMessage = { ...message };
            this.#swapDiceRollMetadata(ddbMessage);
            this.#pendingMessage = ddbMessage;
            this.ddbDispatch(ddbMessage);
        } else if (message.eventType === "dice/roll/fulfilled" && this.#pendingMessage?.data?.rollId === message.data.rollId) {
            console.log("capturing fulfilled message: ", message)
            let alteredMessage = this.#swapRollData(message);
            console.log("altered fulfilled message: ", alteredMessage);
            this.ddbDispatch(alteredMessage);
            this.#resetVariables();
        }
        console.groupEnd();
    }

    /** iterates over the rolls of a DDB message, calculates #pendingDiceRoll.expression, and swaps any data necessary to make the message match the expression result */
    #swapRollData(ddbMessage) {
        console.group("DiceRoller.#swapRollData");
        try {
            let alteredMessage = { ...ddbMessage };
            alteredMessage.data.rolls.forEach(r => {

                // so we need to parse r.diceNotationStr to figure out the order of the results
                // then iterate over r.result.values to align the dice and their values
                // then work through this.#pendingDiceRoll.expression, and replace each expression with the correct number of values
                // then figure out any constants (such as +4), and update r.diceNotation.constant, and r.result.constant
                // then update r.result.text, and r.result.total

                // 1. match dice types with their results so we can properly replace each dice expression with the correct result
                // all DDB dice types will be grouped together. For example: "1d4+2d6-3d8+4d10-5d20+1d100-2d20kh1+2d20kl1-1d3" turns into "9d20+5d10+3d8+2d6+1d4"
                // all the values are in the same order as the DDB expression so iterate over the expression, and pull out the values that correspond
                let matchedValues = {}; // { d20: [1, 18], ... }
                let rolledExpressions = r.diceNotationStr.match(allDiceRegex);
                console.debug("rolledExpressions: ", rolledExpressions);
                let valuesToMatch = r.result.values;
                rolledExpressions.forEach(diceExpression => {
                    console.debug("diceExpression: ", diceExpression);
                    let diceType = diceExpression.match(/d\d+/g);
                    let numberOfDice = parseInt(diceExpression.split("d")[0]);
                    if (matchedValues[diceType] === undefined) {
                        matchedValues[diceType] = [];
                    }
                    if (diceExpression.includes("ro")) {
                        // we've doubled the dice in case we needed to reroll, so grab twice as many dice as expected
                        numberOfDice = numberOfDice * 2;
                    }
                    matchedValues[diceType] = matchedValues[diceType].concat(valuesToMatch.slice(0, numberOfDice));
                    valuesToMatch = valuesToMatch.slice(numberOfDice);
                });
                console.debug("matchedValues: ", JSON.stringify(matchedValues));

                // 2. replace each dice expression in #pendingDiceRoll.expression with the corresponding dice roll results
                // For example: "2d20kh1+1d4-3" with rolled results of [9, 18, 2] will turn into "18+2-3"
                // we also need to collect the results that we use which will end up being [18, 2] in this example
                let replacedExpression = this.#pendingDiceRoll.expression.toString(); // make sure we have a new string that we alter so we don't accidentally mess up the original
                let replacedValues = []; // will go into the roll object and DDB also parses these.
                this.#pendingDiceRoll.diceExpressions.forEach(diceExpression => {
                    let diceType = diceExpression.match(/d\d+/g);
                    let numberOfDice = parseInt(diceExpression.split("d")[0]);
                    const includesReroll = diceExpression.includes("ro");
                    if (includesReroll) {
                        // we've doubled the dice in case we needed to reroll so grab twice as many dice as expected
                        numberOfDice = numberOfDice * 2;
                    }
                    let calculationValues = matchedValues[diceType].slice(0, numberOfDice);
                    matchedValues[diceType] = matchedValues[diceType].slice(numberOfDice);
                    console.debug(diceExpression, "calculationValues: ", calculationValues);

                    if (includesReroll) {
                        // we have twice as many dice values as we need, so we need to figure out which dice values to drop.
                        // the values are in-order, so we will only keep the front half of the array.
                        // evaluate each of the calculationValues against the reroll rule.
                        // any value that evaluates to false, gets dropped. This allows the reroll dice to "shift" into the front half of the array.
                        // cut the matchedValues down to the expected size. This will drop any reroll dice that we didn't use
                        const half = Math.ceil(calculationValues.length / 2);
                        let rolledValues = calculationValues.slice(0, half)
                        let rerolledValues = calculationValues.slice(half)
                        const rerollModifier = diceExpression.match(/ro(<|<=|>|>=|=)\d+/);
                        calculationValues = rolledValues.map(value => {
                            const rerollExpression = rerollModifier[0].replace('ro', value).replace(/(?<!(<|>))=(?!(<|>))/, "==");
                            console.debug("rerollExpression", rerollExpression)
                            if (eval(rerollExpression)) {
                                return rerolledValues.shift();
                            } else {
                                return value;
                            }
                        });
                    }

                    if (diceExpression.includes("kh")) {
                        // "keep highest" was used so figure out how many to keep
                        let numberToKeep = parseInt(diceExpression.split("kh")[1]);
                        // then sort and only take the highest values
                        calculationValues = calculationValues.sort((a, b) => b - a).slice(0, numberToKeep);
                        console.debug(diceExpression, "kh calculationValues: ", calculationValues);
                    } else if (diceExpression.includes("kl")) {
                        // "keep lowest" was used so figure out how many to keep
                        let numberToKeep = parseInt(diceExpression.split("kl")[1]);
                        // then sort and only take the lowest values
                        calculationValues = calculationValues.sort((a, b) => a - b).slice(0, numberToKeep);
                        console.debug(diceExpression, "kl calculationValues: ", calculationValues);
                    }

                    // finally, replace the diceExpression with the results that we have. For example 2d20 with results [2, 9] will result in "(2+9)", 1d20 with results of [3] will result in "3"
                    let replacementString = calculationValues.length > 1 ? "(" + calculationValues.join("+") + ")" : calculationValues.join("+"); // if there are more than one make sure they get totalled together
                    replacedExpression = replacedExpression.replace(diceExpression, replacementString);
                    replacedValues = replacedValues.concat(calculationValues);
                });

                // now that we've replaced all the dice expressions with their results, we need to execute the expression to get the final result
                let calculatedTotal = eval(replacedExpression);
                console.log("pendingExpression: ", this.#pendingDiceRoll.expression, ", replacedExpression: ", replacedExpression, ", calculatedTotal:", calculatedTotal, ", replacedValues: ", replacedValues);

                // we successfully processed the expression, now let's update the message object
                r.diceNotationStr = this.#pendingDiceRoll.expression; // this doesn't appear to actually do anything
                r.diceNotation.constant = this.#pendingDiceRoll.calculatedConstant;
                r.result.constant = this.#pendingDiceRoll.calculatedConstant;
                r.result.text = replacedExpression;
                r.result.total = calculatedTotal;
                if (this.#pendingDiceRoll.isComplex()) {
                    r.result.values = replacedValues;
                }
                if (this.#pendingDiceRoll.rollType) {
                    r.rollType = this.#pendingDiceRoll.rollType;
                }
                // need to update the replacedValues above based on kh and kl if we do this
                if (this.#pendingDiceRoll.isAdvantage()) {
                    r.rollKind = "advantage";
                } else if (this.#pendingDiceRoll.isDisadvantage()) {
                    r.rollKind = "disadvantage";
                }
                this.#pendingDiceRoll.resultTotal = calculatedTotal;
                this.#pendingDiceRoll.resultValues = replacedValues;
                this.#pendingDiceRoll.expressionResult = replacedExpression;
            });

            this.#swapDiceRollMetadata(alteredMessage);

            console.groupEnd();
            return alteredMessage;
        } catch (error) {
            console.warn("Failed to swap roll data", error);
            console.groupEnd();
            return ddbMessage // we failed to parse the message so return the original message
        }
    }

    #swapDiceRollMetadata(ddbMessage) {

        if (this.#pendingDiceRoll?.isComplex()) {
            // We manipulated this enough that DDB won't properly display the formula.
            // We'll look for this later to know that we should swap some HTML after this render
            ddbMessage.avttExpression = this.#pendingDiceRoll.expression;
            ddbMessage.avttExpressionResult = this.#pendingDiceRoll.expressionResult;
            console.log("DiceRoll ddbMessage.avttExpression: ", ddbMessage.avttExpression);
        }

        if (["character", "monster"].includes(this.#pendingDiceRoll.entityType)) {
            ddbMessage.entityType = this.#pendingDiceRoll.entityType;
            ddbMessage.data.context.entityType = this.#pendingDiceRoll.entityType;
        }
        if (this.#pendingDiceRoll.entityId !== undefined) {
            ddbMessage.entityId = this.#pendingDiceRoll.entityId;
            ddbMessage.data.context.entityId = this.#pendingDiceRoll.entityId;
        }
        const isValid = (str) => { return typeof str === "string" && true && str.length > 0 };
        if (isValid(this.#pendingDiceRoll.action)) {
            ddbMessage.data.action = this.#pendingDiceRoll.action;
        }
        if (isValid(this.#pendingDiceRoll.avatarUrl)) {
            ddbMessage.data.context.avatarUrl = this.#pendingDiceRoll.avatarUrl;
        }
        if (isValid(this.#pendingDiceRoll.name)) {
            ddbMessage.data.context.name = this.#pendingDiceRoll.name;
        }
    }
}

function replace_gamelog_message_expressions(listItem) {

    let expressionSpan = listItem.find(".tss-1wcf5kt-Line-Notation span");
    if (expressionSpan.length > 0) {
        let avttExpression = listItem.attr("data-avtt-expression");
        if (avttExpression !== undefined && avttExpression.length > 0) {
            expressionSpan.text(avttExpression);
            expressionSpan.attr("title", avttExpression);
            console.log("injected avttExpression", avttExpression);
        }
    }

    let expressionResultSpan = listItem.find(".tss-16k6xf2-Line-Breakdown span");
    if (expressionResultSpan.length > 0) {
        let avttExpressionResult = listItem.attr("data-avtt-expression-result");
        if (avttExpressionResult !== undefined && avttExpressionResult.length > 0) {
            expressionResultSpan.text(avttExpressionResult);
            console.log("injected avttExpressionResult", avttExpressionResult);
        }
    }
}

function getCharacterStatModifiers() {
    if (is_characters_page()) {
        let stats = $(".ddbc-ability-summary__secondary");
        return {
            "str": Math.floor((parseInt(stats[0].textContent) - 10) / 2),
            "dex": Math.floor((parseInt(stats[1].textContent) - 10) / 2),
            "con": Math.floor((parseInt(stats[2].textContent) - 10) / 2),
            "int": Math.floor((parseInt(stats[3].textContent) - 10) / 2),
            "wis": Math.floor((parseInt(stats[4].textContent) - 10) / 2),
            "cha": Math.floor((parseInt(stats[5].textContent) - 10) / 2),
            "pb": parseInt($(".ct-proficiency-bonus-box__value .ddbc-signed-number__number").text())
        };
    }
    if (window.DM) {
        try {
            const sheet = find_currently_open_character_sheet();
            if (!sheet) return undefined;
            const stats = window.PLAYER_STATS[sheet];
            if (!stats || !stats.abilities) return undefined;
            return {
                "str": parseInt(stats.abilities.find(stat => stat.abilityAbbr === "str").modifier),
                "dex": parseInt(stats.abilities.find(stat => stat.abilityAbbr === "dex").modifier),
                "con": parseInt(stats.abilities.find(stat => stat.abilityAbbr === "con").modifier),
                "int": parseInt(stats.abilities.find(stat => stat.abilityAbbr === "int").modifier),
                "wis": parseInt(stats.abilities.find(stat => stat.abilityAbbr === "wis").modifier),
                "cha": parseInt(stats.abilities.find(stat => stat.abilityAbbr === "cha").modifier),
                "pb": parseInt($($("#sheet").find("iframe").contents()).find(".ct-proficiency-bonus-box__value .ddbc-signed-number__number").text())
            };
        } catch (error) {
            console.warn("getCharacterStatModifiers Failed to parse player stats", error);
            return undefined;
        }
    }
    return undefined;
}

/**
 * Takes the raw strong from the chat input, and returns a new string with all the modifier keys replaced with numbers.
 * This only works on the character page. If this is called from a different page, it will immediately return the given slashCommand.
 * @example passing "1d20+dex+pb" would return "1d20+3+2" for a player that has a +2 dex mod and a proficiency bonus of 2
 * @param slashCommandText {String} the string from the chat input
 * @returns {String} a new string with numbers instead of modifier if on the characters page, else returns the given slashCommand.
 */
function replaceModifiersInSlashCommand(slashCommandText) {
    if (typeof slashCommandText !== "string") {
        console.warn("replaceModifiersInSlashCommand expected a string, but received", slashCommandText);
        return "";
    }

    const expression = slashCommandText.replace(diceRollCommandRegex, "").match(allowedExpressionCharactersRegex)?.[0];

    if (expression === undefined || expression === "") {
        return slashCommandText; // no valid expression to parse
    }

    const modifiers = getCharacterStatModifiers();
    if (modifiers === undefined) {
        // This will happen if the DM opens a character sheet before the character stats have loaded
        console.warn("getCharacterStatModifiers returned undefined. This command may not parse properly", slashCommandText);
        return slashCommandText; // missing required info
    }

    let modifiedExpression = `${expression}`; // make sure we use a copy of the string instead of altering the variable that was passed in
    const modifiersToReplace = expression.matchAll(validModifierSubstitutions);
    const validModifierPrefix = /(\s*[+|-]\s*)$/; // we only want to substitute valid parts of the expression. For example: We only want to replace the first `dex` in this string "/r 1d20 + dex dex-based attack"
    for (const match of modifiersToReplace) {
        const mod = match[0];
        const expressionUpToThisPoint = match.input.substring(0, match.index);
        if (validModifierPrefix.test(expressionUpToThisPoint)) {
            // everything up to and including this match is valid. let's replace this modifier with the appropriate value.
            modifiedExpression = modifiedExpression.replace(mod, modifiers[mod.toLowerCase()]); // explicitly only replacing the first match. We do not want to replaceAll here.
        } else {
            break; // we got to a point in the expression that is no longer valid. Stop substituting
        }
    }

    const modifiedCommand = slashCommandText.replaceAll(expression, modifiedExpression);

    console.log("replaceModifiersInSlashCommand changed", slashCommandText, "to", modifiedCommand);
    return modifiedCommand;
}

/**
 * Attempts to convert the output of an rpgDiceRoller DiceRoll to the DDB format.
 * If the conversion is successful, it will be sent over the websocket, and this will return true.
 * If the conversion fails for any reason, nothing will be sent, and this will return false,
 * @param {String} expression the dice rolling expression; ex: 1d20+4
 * @param {String|undefined} displayName
 * @param {String|undefined} imgUrl
 * @param {String|undefined} rollType
 * @param {String|undefined} actionType
 * @param {String|undefined} sendTo
 * @returns {Boolean} true if we were able to convert and attempted to send; else false */
function send_rpg_dice_to_ddb(expression, displayName, imgUrl, rollType, actionType, sendTo = "Everyone") {

    console.group("send_rpg_dice_to_ddb");

    console.log("with values", expression, displayName, imgUrl, rollType, actionType, sendTo)


    try {
        expression = expression.replace(/\s+/g, ''); // remove all whitespace

        const supportedDieTypes = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

        let roll = new rpgDiceRoller.DiceRoll(expression);

        // rpgDiceRoller doesn't give us the notation of each roll so we're going to do our best to find and match them as we go
        var choppedExpression = expression;
        let notationList = [];
        for (let i = 0; i < roll.rolls.length; i++) {
            let currentRoll = roll.rolls[i];
            if (typeof currentRoll === "string") {
                let idx = choppedExpression.indexOf(currentRoll);
                let previousNotation = choppedExpression.slice(0, idx);
                notationList.push(previousNotation);
                notationList.push(currentRoll);
                choppedExpression = choppedExpression.slice(idx + currentRoll.length);
            }
        }
        console.log("chopped expression", choppedExpression)
        notationList.push(choppedExpression); // our last notation will still be here so add it to the list

        if (roll.rolls.length !== notationList.length) {
            console.warn(`Failed to convert expression to DDB roll; expression ${expression}`);
            console.groupEnd()
            return false;
        }

        let convertedDice = [];       // a list of objects in the format that DDB expects
        let allValues = [];           // all the rolled values
        let convertedExpression = []; // a list of strings that we'll concat for a string representation of the final math being done
        let constantsTotal = 0;       // all the constants added together
        for (let i = 0; i < roll.rolls.length; i++) {
            let currentRoll = roll.rolls[i];
            if (typeof currentRoll === "object") {
                let currentNotation = notationList[i];
                let currentDieType = supportedDieTypes.find(dt => currentNotation.includes(dt)); // we do it this way instead of splitting the string so we can easily clean up things like d20kh1, etc. It's less clever, but it avoids any parsing errors
                if (!supportedDieTypes.includes(currentDieType)) {
                    console.warn(`found an unsupported dieType ${currentNotation}`);
                    console.groupEnd()
                    return false;
                }
                if (currentNotation.includes("kh") || currentNotation.includes("kl")) {
                    let cleanerString = currentRoll.toString()
                      .replace("[", "(")    // swap square brackets with parenthesis
                      .replace("]", ")")    // swap square brackets with parenthesis
                      .replace("d", "")     // remove all drop notations
                      .replace(/\s+/g, ''); // remove all whitespace
                    convertedExpression.push(cleanerString);
                } else {
                    convertedExpression.push(currentRoll.value);
                }
                let dice = currentRoll.rolls.map(d => {
                    allValues.push(d.value);
                    console.groupEnd()
                    return { dieType: currentDieType, dieValue: d.value };
                });

                convertedDice.push({
                    "dice": dice,
                    "count": dice.length,
                    "dieType": currentDieType,
                    "operation": 0
                })
            } else if (typeof currentRoll === "string") {
                convertedExpression.push(currentRoll);
            } else if (typeof currentRoll === "number") {
                convertedExpression.push(currentRoll);
                if (i > 0) {
                    if (convertedExpression[i-1] === "-") {
                        constantsTotal -= currentRoll;
                    } else if (convertedExpression[i-1] === "+") {
                        constantsTotal += currentRoll;
                    } else {
                        console.warn(`found an unexpected symbol ${convertedExpression[i-1]}`);
                        console.groupEnd()
                        return false;
                    }
                } else {
                    constantsTotal += currentRoll;
                }
            }
        }
        let ddbJson = {
            id: uuid(),
            dateTime: `${Date.now()}`,
            gameId: window.MB.gameid,
            userId: window.MB.userid,
            source: "web",
            persist: true,
            messageScope: sendTo === "Everyone" ?  "gameId" : "userId",
            messageTarget: sendTo === "Everyone" ?  window.MB.gameid : window.MB.userid,
            entityId: window.MB.userid,
            entityType: "user",
            eventType: "dice/roll/fulfilled",
            data: {
                action: actionType ? actionType : "custom",
                setId: window.mydice.data.setId,
                context: {
                    entityId: window.MB.userid,
                    entityType: "user",
                    messageScope: sendTo === "Everyone" ?  "gameId" : "userId",
                    messageTarget: sendTo === "Everyone" ?  window.MB.gameid : window.MB.userid,
                    name: displayName ? displayName : window.PLAYER_NAME,
                    avatarUrl: imgUrl ? imgUrl : window.PLAYER_IMG
                },
                rollId: uuid(),
                rolls: [
                    {
                        diceNotation: {
                            set: convertedDice,
                            constant: constantsTotal
                        },
                        diceNotationStr: expression,
                        rollType: rollType ? rollType : "roll",
                        rollKind: expression.includes("kh") ? "advantage" : expression.includes("kl") ? "disadvantage" : "",
                        result: {
                            constant: constantsTotal,
                            values: allValues,
                            total: roll.total,
                            text: convertedExpression.join("")
                        }
                    }
                ]
            }
        };
        if (window.MB.ws.readyState === window.MB.ws.OPEN) {
            window.MB.ws.send(JSON.stringify(ddbJson));
            console.groupEnd()
            return true;
        } else { // TRY TO RECOVER
            get_cobalt_token(function(token) {
                window.MB.loadWS(token, function() {
                    window.MB.ws.send(JSON.stringify(ddbJson));
                });
            });
            console.groupEnd()
            return true; // we can't guarantee that this actually worked, unfortunately
        }
    } catch (error) {
        console.warn(`failed to send expression as DDB roll; expression = ${expression}`, error);
        console.groupEnd()
        return false;
    }
}

/** Attempts to inject a chat message using the raw rpgDiceRoller output
 * @param {string} output rpgDiceRoller.DiceRoll.output
 * @param {boolean} sendToDmOnly true if this should only go to the dm, else false
 * @return {boolean} true if we tried to send the message, else false */
function send_rpg_dice_output_as_chat_message(expression, sendToDmOnly) {
    try {
        let roll = new rpgDiceRoller.DiceRoll(expression);
        if (typeof output !== "string" || output.length === 0) return false;
        const data = {
            player: window.PLAYER_NAME,
            img: window.PLAYER_IMG,
            text: roll.output,
            dmonly: sendToDmOnly === true,
            id: window.DM ? `li_${new Date().getTime()}` : undefined
        };
        window.MB.inject_chat(data);
        return true;
    } catch (error) {
        console.warn(`send_rpg_dice_as_chat_message failed to send rpgDice result as chat`, output, error);
        return false;
    }
}

function hijack_ddb_dice_buttons() {
    $(".integrated-dice__container:not(.avtt-roll-formula-button)").click(function(e) {
        if (!is_abovevtt_page() || get_avtt_setting_value("bypassDdbDice") !== true) return;
        let hijacked = roll_hijacked_button($(e.currentTarget));
        if (hijacked) {
            console.debug("hijack_ddb_dice_buttons successfully hijacked", e.currentTarget.outerHTML);
            e.stopPropagation();
        }
    });
}

function roll_hijacked_button(button) {
    try {
        if (!button || button.length === 0) return;

        let expression;

        if (button.find(".ddbc-damage__value").length >= 1) {
            // hijack the damage roll
            expression = button.find(".ddbc-damage__value").text();
        } else if (button.find(".ddbc-signed-number").length >= 1) {
            const modifier = button.find(".ddbc-signed-number").attr("aria-label");
            expression = `1d20${modifier}`;
        } else {
            console.warn("roll_hijacked_button does not know how to handle", button[0].outerHTML);
            return false;
        }

        let displayName = window.PLAYER_NAME;
        let imgurl = window.PLAYER_IMG;
        let rollType;
        let actionType;
        let sendTo;

        const parent = button.parent();
        if (parent.hasClass("ddbc-saving-throws-summary__ability-modifier")) {
            rollType = "save";
            actionType = parent.siblings(".ddbc-saving-throws-summary__ability-name").text();
        } else if (parent.hasClass("ct-skills__col--modifier") || parent.hasClass("ddbc-ability-summary__primary")) {
            rollType = "check";
            actionType = parent.siblings(".ct-skills__col--skill").text();
        } else if (parent.hasClass("ct-initiative-box__value")) {
            rollType = "roll";
            actionType = "initiative";
        // } else if (parent.is('[class*="tohit"]')) {
        //     console.log("tohit");
        //     rollType = "to hit";
        //     actionType = parent.parent().siblings(".ddbc-combat-attack__name").find(".ddbc-combat-attack__label").text();
        }

        // button.parent()[0].classList.forEach(c => {
        //     console.log(c, typeof c);
        //     if (c.includes("saving-throw")) {
        //         rollType = "save";
        //     } else if (c.includes("skill") || c.includes("ability")) {
        //         // make sure we check for saving throws before we check for ability
        //         rollType = "check";
        //     } else if (c.includes("damage")) {
        //         rollType = "damage";
        //     } else if (c.includes("tohit")) {
        //         rollType = "to hit";
        //     } else if (c.includes("initiative")) {
        //         rollType = "roll";
        //         actionType = "initiative";
        //     }
        // });

        console.log("roll_hijacked_button", expression, displayName, imgurl, rollType, actionType);
        return send_rpg_dice_to_ddb(expression, displayName, imgurl, rollType, actionType);
    } catch (error) {
        console.warn("roll_hijacked_button failed to parse", button);
        return false;
    }
}