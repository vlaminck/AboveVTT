
function f(selector) {
	return window.EncounterHandler.body.find(selector);
}

let gamedoc; // this will get replaced below

class EncounterHandler {

	constructor(callback) {
		let path = window.location.href;
		let pathWithoutQuery = path.split("?")[0];
		let lastComponent = pathWithoutQuery.substring(pathWithoutQuery.lastIndexOf('/') + 1);
		this.campaignId = lastComponent;
		this.avttId = "";
		this.encounters = {};
		this.iframe;
		this.fetch_all_encounters(function () {
			if (window.EncounterHandler.avttId === undefined || window.EncounterHandler.avttId.length == 0) {
				// we don't have an encounter named AboveVTT so create one
				window.EncounterHandler.create_avtt_encounter(function() {
					if (typeof callback === 'function') {
						callback();
					}
				});
			} else {
				if (typeof callback === 'function') {
					callback();
				}
			}
		});
	}

	get document() {
		return this.iframe[0].contentDocument;
	}
	get body() {
		return $(this.document.body);
	}

	has_avtt_encounter() {
		return (this.avttId !== undefined && this.avttId.length > 0);
	}

	fetch_or_create_avtt_encounter(callback) {
		if (this.avttId !== undefined && this.avttId.length > 0 && this.avttId in this.encounters) {
			// we have it locally, just return it
			callback(this.encounters[this.avttId]);
		} else {
			// we don't have it locally, so fetch all encounters and see if we have it locally then
			this.fetch_all_encounters(function () {
				let avttEncounter = window.EncounterHandler.encounters[window.EncounterHandler.avttId];
				if (avttEncounter !== undefined) {
					// we found it!
					callback(avttEncounter);
				} else {
					// there isn't an encounter for this campaign with the name AboveVTT so let's create one
					window.EncounterHandler.create_avtt_encounter(callback);
				}
			});
		}
	}

	fetch_all_encounters(callback, pageNumber = 1) {
		console.log(`fetch_all_encounters starting with pageNumber: ${pageNumber}`);
		get_cobalt_token(function (token) {
			$.ajax({
				url: `https://encounter-service.dndbeyond.com/v1/encounters?page=${pageNumber}`,
				beforeSend: function (xhr) {
					xhr.setRequestHeader('Authorization', 'Bearer ' + token);
				},
				xhrFields: {
					withCredentials: true
				},
				success: function (responseData) {
					let encountersList = responseData.data;
					console.log(`fetch_all_encounters successfully fetched ${encountersList.length} encounters; pageNumber: ${pageNumber}`);
					for (let i = 0; i < encountersList.length; i++) {
						let encounter = encountersList[i];
						if (encounter.campaign !== undefined && encounter.campaign != null && encounter.campaign.id == window.EncounterHandler.campaignId) {
							window.EncounterHandler.encounters[encounter.id] = encounter;
							if (encounter.name == "AboveVTT") {
								window.EncounterHandler.avttId = encounter.id;
							}
						}
					}
					if (responseData.pagination.currentPage < responseData.pagination.pages) {
						window.EncounterHandler.fetch_all_encounters(callback, pageNumber + 1);
					} else if (typeof callback === 'function') {
						console.log(`fetch_all_encounters successfully fetched all encounters; pageNumber: ${[pageNumber]}`);
						callback();
					}
				},
				failure: function (errorMessage) {
					console.warn(`fetch_all_encounters failed; ${errorMessage}`);
					if (typeof callback === 'function') {
						callback();
					}
				}
			});
		});
	}

	fetch_campaign_info(callback) {
		console.log(`fetch_campaign_info starting`);
		get_cobalt_token(function (token) {
			$.ajax({
				url: `https://www.dndbeyond.com/api/campaign/stt/active-campaigns/${window.EncounterHandler.campaignId}`,
				beforeSend: function (xhr) {
					xhr.setRequestHeader('Authorization', 'Bearer ' + token);
				},
				xhrFields: {
					withCredentials: true
				},
				success: function (responseData) {
					console.log(`fetch_campaign_info succeeded`);
					window.EncounterHandler.campaign = responseData.data;
					if (typeof callback === 'function') {
						callback();
					}
				},
				failure: function (errorMessage) {
					console.warn(`fetch_campaign_info failed ${errorMessage}`);
					if (typeof callback === 'function') {
						callback();
					}
				}
			});
		});
	}

	create_avtt_encounter(callback) {
		if (!window.DM) {
			console.log("Not creating AboveVTT encounter; only the DM can do that");
			if (typeof callback === 'function') {
				callback();
			}
			return;
		}
		console.log(`create_avtt_encounter starting`);
		window.EncounterHandler.fetch_campaign_info(function() {
			
			let campaignInfo = window.EncounterHandler.campaign;
			if (campaignInfo === undefined) {
				// this is the bare minimum that we need to send
				campaignInfo = {
					"id": window.EncounterHandler.campaignId
				};
			}
			if (campaignInfo.id != window.EncounterHandler.campaignId) {
				// TODO: not sure this is even a concern, but we need to make sure we create the encounter for this campaign
				campaignInfo.id = window.EncounterHandler.campaignId;
			}

			get_cobalt_token(function (token) {
				$.ajax({
					type: "POST",
					contentType: "application/json; charset=utf-8",
					dataType: "json",
					url: `https://encounter-service.dndbeyond.com/v1/encounters`,
					data: JSON.stringify({
						"campaign": campaignInfo,
						"name": "AboveVTT"
					}),
					beforeSend: function (xhr) {
						xhr.setRequestHeader('Authorization', 'Bearer ' + token);
					},
					xhrFields: {
						withCredentials: true
					},
					success: function (responseData) {
						console.log(`create_avtt_encounter successfully created encounter`);
						let avttEncounter = responseData.data;
						window.EncounterHandler.encounters[avttEncounter.id] = avttEncounter;
						if (typeof callback === 'function') {
							callback(avttEncounter);
						}
					},
					failure: function (errorMessage) {
						console.warn(`create_avtt_encounter failed ${errorMessage}`);
						if (typeof callback === 'function') {
							callback();
						}
					}
				});
			});
		});
	}

}



function init_encounter_iframe(callback) {



	// before we load in the encounters page, we need to remove things from this page that will get in our way
	$(".sidebar").remove(); // we don't want 2 sidebars on our page





	let didClickNavigateToEditButton = false;


	window.EncounterHandler.iframe = $("<iframe id='iframe-backing-encounter'></iframe>");
	window.EncounterHandler.iframe.css({
		"position": "fixed",
		"width": "100%",
		"height": "100%",
		"top": "0px",
		"left": "0px"
	});

	window.EncounterHandler.iframe.on("load", function (event) {
		if (!this.src) {
			// it was just created. no need to do anything until it actually loads something
			return;
		}

		gamedoc = window.EncounterHandler.document;

		if (typeof callback === 'function') {
			callback();
		}



		$(event.target).contents().find("body").on("DOMNodeInserted", function (addedEvent) {
			// the combat tracker loads first. Once it's loaded, we can navigate to the encounter builder at which point the combat tracker is removed
			let combatTracker = $(event.target).contents().find("#encounter-builder-root div.combat-tracker-page");
			// once the encounter builder is loaded, we can start stripping away all the elements we don't want our users to see
			let encounterBuilder = $(event.target).contents().find("#encounter-builder-root div.encounter-builder");
			let addedElement = $(addedEvent.target);

			// if (combatTracker.length > 0) {
			// 	let navigateToEdit = addedElement.find(`a[href='/encounters/${window.EncounterHandler.avttId}/edit']`);
			// 	if (navigateToEdit.length > 0 && !didClickNavigateToEditButton) {
			// 		didClickNavigateToEditButton = true;
			// 		// we need to let it load just a bit more before we navigate away. Otherwise the dice rolling won't be associated with the encounter somehow
			// 		setTimeout(function () {
			// 			navigateToEdit[0].click();
			// 		}, 500);
			// 	}
			// }

			if (encounterBuilder.length > 0) {

				console.log("here we go");
				only_once_dude(event);

			}

		});
	});

	$("body #site").before(window.EncounterHandler.iframe);
	if (window.EncounterHandler.has_avtt_encounter()) {
		window.EncounterHandler.iframe.attr("src", `/encounters/${window.EncounterHandler.avttId}/edit`);
		// iframe.attr("src", `/combat-tracker/${window.EncounterHandler.avttId}`);
	} else {
		window.EncounterHandler.iframe.attr("src", `/encounter-builder`);
	}


}

let i_already_did = false;
function only_once_dude(event, callback) {
	if (i_already_did) {
		return;
	}
	i_already_did = true;
	// $(event.target).contents().find("body").css("visibility", "hidden");
	$(event.target).contents().find(".dice-rolling-panel").css("visibility", "visible");
	$(event.target).contents().find("#site-main").css({"display": "block", "visibility": "hidden"});
	$(event.target).contents().find(".dice-rolling-panel").css({"visibility": "visible"});
	$(event.target).contents().find("div.sidebar").parent().css({"display": "block", "visibility": "visible"});
	$(event.target).contents().find("div.dice-toolbar").css({"bottom": "35px"});
	$(event.target).contents().find("button.MuiButtonBase-root").click();
	$(event.target).contents().find("div.MuiPopover-root").css({"display": "block", "visibility": "visible"});

	
	if (typeof callback === 'function') {
		callback();
	}

}