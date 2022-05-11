
/**
 * Adds in rolling buttons and spell tracker inputs to monster frames that are not encounter frames.
 * Specifically monster frames that appear to the player
 * @param {$} target jqeury selected element to put rolling buttons into
 * @param {object} stats stats of the monster
 * @param {string} tokenId id of the token
 */
function scan_monster(target, stats, tokenId) {
	console.group("scan_monster")
	console.log("adding in avtt dice buttons")
	// remove homebrew panels
	target.find(".homebrew-creation-actions").remove();
	target.find(".homebrew-previous-versions").remove();
	target.find(".homebrew-details-footer").remove();
	target.find("footer").remove()
	target.find("#footer-push").remove();
	target.find("#footer").remove();
	$("iframe")
	target.find(".integrated-dice__container").hide();
	// attempt to the tokens name first, failing tha
	const creatureName = window.TOKEN_OBJECTS[tokenId]?.options.name || target.find(".mon-stat-block__name-link").text(); // Wolf, Owl, etc
	const creatureAvatar = stats.data.avatarUrl
	const displayName = `${pc.name} (${creatureName})`;

	const clickHandler = function(clickEvent) {
		roll_button_clicked(clickEvent, displayName, creatureAvatar)
	};

	const rightClickHandler = function(contextmenuEvent) {
		roll_button_contextmenu_handler(contextmenuEvent, displayName, creatureAvatar);
	}

	replace_ability_scores_with_avtt_rollers(target, ".ability-block__stat" ,".ability-block__heading", true)
	replace_saves_skill_with_avtt_rollers(target, ".mon-stat-block__tidbit", ".mon-stat-block__tidbit-label", ".mon-stat-block__tidbit-data", true )

	// replace all "to hit" and "damage" rolls
	$(target).find(".mon-stat-block p").each(function() {
		let currentElement = $(this)
		if (currentElement.find(".avtt-roll-button").length == 0) {
			$(currentElement).find("span").each(function (){
				console.log("this",$(this))
				const modMatch = $(this).attr("data-dicenotation")?.match(/(\+|-).*/gm)
				const modifier = modMatch ? modMatch.shift() : "+0"
				const dice = $(this).attr("data-dicenotation")?.replace(/(\+|-).*/gm, "")
				const rollType = $(this).attr("data-rolltype")?.replace(" ","-")
				const actionType = $(this).attr("data-rollaction")?.replace(" ","-") || "custom"
				const text = $(this)?.text()
				if (rollType === "damage"){
					$(this).after(`<button data-exp=${dice} data-mod="${modifier}CRIT" data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType} critical">Crit</button>`)
				} else if (rollType === "to-hit"){
					$(this).after(`<button data-exp="2d20kh1" data-mod=${modifier} data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType} advantage">Adv</button>
								   <button data-exp="2d20kl1" data-mod=${modifier} data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType} disadvantage">Dis</button>`)
				}
				$(this).replaceWith(`<button data-exp=${dice} data-mod=${modifier} data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType}">${text}</button>`)				
			})
		}
	});

	// the iframe all these button exist in doesn't have the styling from above.css so add the styling here
	$(target).find(".avtt-roll-button").css(
	{
		"color": "#b43c35",
		"border": "1px solid #b43c35",
		"border-radius": "4px",
		"background-color":" #fff",
		"white-space":" nowrap",
		"font-size": "14px",
		"font-weight": "600",
		"font-family":"Roboto Condensed,Open Sans,Helvetica,sans-serif",
		"line-height": "18px",
		"letter-spacing": "1px",
		"padding": "1px 4px 0"
	}
	)


	$(target).find(".avtt-roll-button").click(clickHandler);
	$(target).find(".avtt-roll-button").on("contextmenu", rightClickHandler);
	add_ability_tracker_inputs(target, tokenId)
	
	console.groupEnd()
}

/**
 * Adds in tracker input slot on elements that appear as "2/Day each"
 * @param {$} target 
 * @param {string} tokenId 
 */
function add_ability_tracker_inputs_on_each(target, tokenId){
	const token = window.TOKEN_OBJECTS[tokenId];
	target.find(".mon-stat-block__description-block-content > p").each(function() {
		let element = $(this);
		if (element.find(".injected-input").length == 0) {
			const matchForEachSlot = element.text().match(/([0-9])\/Day each:/i)
			if (matchForEachSlot){
				const numberFound = parseInt(matchForEachSlot[1]);
				element.children().each(function (indexInArray, valueOfElement) { 
					const key  = $(valueOfElement).text()
					const remaining = token.get_tracked_ability(key, numberFound);

					$(valueOfElement).after(createCountTracker(tokenId, key.replace(/\s/g, ""), remaining, "", ""))
				});			
			}
			
		}
	});	
}

/**
 * Creates the input tracker used for spell/legendaries and then calls token.track_ability
 * @param {object} token 
 * @param {string} key 
 * @param {string} remaining 
 * @param {string} foundDescription 
 * @param {string} descriptionPostfix 
 * @returns 
 */
function createCountTracker(token, key, remaining, foundDescription, descriptionPostfix) {
	const input = $(`<input class="injected-input" data-token-id="${token.id}" data-tracker-key="${key}" type="number" value="${remaining}" style="font-size: 14px; width: 40px; appearance: none; border: 1px solid #d8e1e8; border-radius: 3px;"> ${foundDescription} ${descriptionPostfix}</input>`);
	input.off("change").on("change", function(changeEvent) {
		const updatedValue = changeEvent.target.value;
		console.log(`add_ability_tracker_inputs ${key} changed to ${updatedValue}`);
		token.track_ability(key, updatedValue);
	});
	return input
}

/**
 * Adds spell/feature/legendary tracker inputs to a monster block
 * @param {$} target 
 * @param {string} tokenId 
 * @returns 
 */
function add_ability_tracker_inputs(target, tokenId) {
	let token = window.TOKEN_OBJECTS[tokenId];
	if (token === undefined) {
		// nothing to track if we don't have a token
		return;
	}

	// Unfortunately, we can't just do a regex replace because DDB breaks if we mess with their html.
	// However, it seems to work just fine if we append the input at the end instead of inline.

	const processInput = function(element, regex, descriptionPostfix, includeMatchingDescription = true) {
		let foundMatches = element.text().match(regex); // matches `(1 slot)`, `(4 slots)`, etc
		if (foundMatches !== undefined && foundMatches != null && foundMatches.length > 1) {
			let numberFound = parseInt(foundMatches[1]);
			if (!isNaN(numberFound)) {
				let foundDescription = includeMatchingDescription ? foundMatches.input.substring(0, foundMatches.index) : descriptionPostfix; // `1st level `, `2nd level `, etc.
				let key = foundDescription.replace(/\s/g, ""); // `1stlevel`, `2ndlevel`, etc.
				let remaining = token.get_tracked_ability(key, numberFound);
				const input = createCountTracker(token, key, remaining, foundDescription, descriptionPostfix)
				element.append(`<br>`);
				element.append(input);
			}
		}
	}

	// //Spell Slots, or technically anything with 'slot'... might be able to refine the regex a bit better...
	target.find(".mon-stat-block__description-block-content > p").each(function() {
		let element = $(this);
		if (element.find(".injected-input").length == 0) {
			processInput(element, /\(([0-9]) slots?\)/, "slots remaining");
			processInput(element, /\(([0-9])\/Day\)/i, "remaining");
			processInput(element, /can take ([0-9]) legendary actions/i, "Legendary Actions remaining", false);
		}
	});	
	add_ability_tracker_inputs_on_each(target, tokenId)
}

/**
 * replaces ability scores with rolling buttons
 * used by both the extra pane scanning and monster frame scanning
 * they're both slightly different and have different selectors as well button count
 * @param {$} target jquery selected target to add buttons into
 * @param {string} outerSelector an outer selector to find against
 * @param {string} innerSelector and inner selector to find against
 * @param {bool} addAdvDisButton whether to add in additional Crit/Adv/Dis buttons (currently only used by monster frame)
 */
function replace_ability_scores_with_avtt_rollers(target, outerSelector, innerSelector, addAdvDisButton) {
	$(target).find(outerSelector).each(function() {
		const currentElement = $(this)
		if (currentElement.find(".avtt-roll-button").length == 0) {
			const abilityType = $(this).find(innerSelector).html()
			const rollType="check"
			// matches (+1) 
			let updated = currentElement.html()
				.replaceAll(/(\([\+\-] ?[0-9][0-9]?\))/g, `<button data-exp='1d20' data-mod='$1' data-rolltype=${rollType} data-actiontype=${abilityType} class='avtt-roll-button' title="${abilityType} ${rollType}">$1</button>`); 
			$(currentElement).html(updated);
			
			if (addAdvDisButton){
				// matches just the +1
				const modMatch = currentElement.text().match(/[\+\-] ?[0-9]?/g)
				const modifier = modMatch ? modMatch.shift() : ""
				currentElement.find(".avtt-roll-button").after(`<button data-exp="2d20kh1" data-mod=${modifier} data-rolltype=${rollType} data-actiontype=${abilityType} class='avtt-roll-button' title="${abilityType} ${rollType} advantage">Adv</button><button data-exp="2d20kl1" data-mod=${modifier}' data-rolltype=${rollType} data-actiontype=${abilityType} class='avtt-roll-button' title="${abilityType}${rollType} disadvantage">Dis</button>`)
				$(this).css("display","flex")
			}

		}
	});
}

/**
 * replaces "tidbits" with avtt roller buttons
 * tidbits are skills/saving throws as well as additional monster stat items that don't have buttons added to
 * @param {$} target jquery selected element
 * @param {string} outerSelector an outer selector to find against
 * @param {string} labelSelector a selector for the tidbit label
 * @param {string} dataSelector a selector for the data section of the tidbit
 * @param {bool} addAdvDisButton 
 */
function replace_saves_skill_with_avtt_rollers(target, outerSelector, labelSelector, dataSelector, addAdvDisButton){
// replace saving throws, skills, etc
$(target).find(outerSelector).each(function() {
	let currentElement = $(this)
	if (currentElement.find(".avtt-roll-button").length == 0) {
		const label = $(currentElement).find(labelSelector).html()
		if (label === "Saving Throws" || label === "Skills"){
			// get the tidbits in the form of ["DEX +3", "CON +4"] or ["Athletics +6", "Perception +3"]
			const tidbitData = $(currentElement).find(dataSelector).text().trim().split(",")
			const allTidBits = []
			tidbitData.forEach((tidbit) => {
				// can only be saving throw or skills here, which is either save/check respectively
				const rollType = label === "Saving Throws" ? "save" : "check"
				// will be DEX/CON/ATHLETICS/PERCEPTION
				const actionType = tidbit.trim().split(" ")[0]
				// matches "+1"
				const modMatcher = tidbit.match(/([\+\-] ?[0-9][0-9]?)/)
				const modifier = modMatcher ? modMatcher.shift() : ""
				if (addAdvDisButton){
					allTidBits.push(tidbit.replace(/([\+\-] ?[0-9][0-9]?)/, `<button data-exp='1d20' data-mod='$1' data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType}">$1</button>`))
					allTidBits.push(
					`<button data-exp='2d20kh1' data-mod=${modifier} data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType} advantage">Adv</button><button data-exp='2d20kl1' data-mod=${modifier} data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType} disadvantage">Dis</button>`)
				} else{
					allTidBits.push(tidbit.replace(/([\+\-] ?[0-9][0-9]?)/, `<button data-exp='1d20' data-mod='$1' data-rolltype=${rollType} data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} ${rollType}">$1</button>`) )
				}
			})
			const thisTidBitData = $(currentElement).find(dataSelector)
			$(thisTidBitData).html(allTidBits);				
		}
	}
});}


/**
 * Scans the player sheet to add in roller buttons to the extra tab
 * @param {$} target jquery selected element
 */
function scan_player_creature_pane(target) {
	console.group("scan_player_creature_pan")

	let creatureType = target.find(".ct-sidebar__header .ct-sidebar__header-parent").text(); // wildshape, familiar, summoned, etc
	let creatureName = target.find(".ct-sidebar__header .ddbc-creature-name").text(); // Wolf, Owl, etc
	let creatureAvatar = window.pc.image;
 	try {
 		// not all creatures have an avatar for some reason
 		creatureAvatar = target.find(".ct-sidebar__header .ct-sidebar__header-preview-image").css("background-image").slice(4, -1).replace(/"/g, "");
 	} catch { }
	let pc = window.pcs.find(t => t.sheet.includes(find_currently_open_character_sheet()));
	let displayName = `${pc.name} (${creatureName} ${creatureType})`;
	
	const clickHandler = function(clickEvent) {
		roll_button_clicked(clickEvent, displayName, creatureAvatar)
	};

	const rightClickHandler = function(contextmenuEvent) {
		roll_button_contextmenu_handler(contextmenuEvent, displayName, creatureAvatar);
	}


	replace_ability_scores_with_avtt_rollers(target, ".ddbc-creature-block__ability-stat", ".ddbc-creature-block__ability-heading")
	replace_saves_skill_with_avtt_rollers(target, ".ddbc-creature-block__tidbit",".ddbc-creature-block__tidbit-label", ".ddbc-creature-block__tidbit-data" )

	// replace all "to hit" and "damage" rolls
	$(target).find(".ct-creature-pane__block p").each(function() {
		let currentElement = $(this)
		if (currentElement.find(".avtt-roll-button").length == 0) {
			// apply most specific regex first matching all possible ways to write a dice notation
			// to account for all the nuances of DNDB dice notation.
			// numbers can be swapped for any number in the following comment
			// matches "1d10", " 1d10 ", "1d10+1", " 1d10+1 ", "1d10 + 1" " 1d10 + 1 "
			const damageRollRegex = /(([0-9]+d[0-9]+)\s?([\+-]\s?[0-9]+)?)/g
			// matches " +1 " or " + 1 "
			const hitRollRegex = /\s([\+-]\s?[0-9]+)\s/g
			let actionType = currentElement.find("strong").html() || "custom"
			let updated = currentElement.html()
				.replaceAll(damageRollRegex, `<button data-exp='$2' data-mod='$3' data-rolltype='damage' data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} damage">$1</button>`)
				.replaceAll(hitRollRegex, `<button data-exp='1d20' data-mod='$1' data-rolltype='to hit' data-actiontype=${actionType} class='avtt-roll-button' title="${actionType} to hit">$1</button>`)
			$(currentElement).html(updated);
		}
	});
	$(target).find(".avtt-roll-button").click(clickHandler);
	$(target).find(".avtt-roll-button").on("contextmenu", rightClickHandler);
	console.groupEnd()
}

/**
 * Stepping stone function to go on to send the dice expressions to DDB via MB
 * makes adjustments to the expression if it's a crit
 * notifies the user if successfully sent to DDB combat log
 * @param {string} displayName how to display the dice roll
 * @param {string} imgUrl the image url to use in the dice roll
 * @param {string} expression dice expression
 * @param {string} modifier dice modifier
 * @param {string} rollType usually "to hit" or "damage" but can also be custom / anything else
 * @param {string} damageType not actually used by DND just yet so this is a placeholder
 * @param {string} actionType the action being performed
 * @param {string} sendTo everyone/DM, open only exists when using extra tab context menu
 */
function roll_our_dice(displayName, imgUrl, expression, modifier, rollType, damageType, actionType, sendTo) {
	console.group("rolling_our_dice", expression, modifier)

	const isCrit = modifier.includes("CRIT")
	modifier = modifier.replace(/[\(\)']+/g, "")
	if (isCrit){
		expression = `${expression}+${expression}`
		modifier = modifier.replace("CRIT", "")
	}
	
	const result = send_rpg_dice_to_ddb(expression+modifier, displayName, imgUrl, rollType, damageType,  actionType, sendTo)
	result ? notify_gamelog() : console.warn("Message could not be sent to DDB")
	console.groupEnd()
}

function find_currently_open_character_sheet() {
	if (is_characters_page()) {
		return window.location.pathname;
	}
	let sheet;
	$("#sheet").find("iframe").each(function () {
		let src = $(this).attr("src");
		if (src != "") {
			sheet = src;
		}
	})
	return sheet;
}

/**
 * Builds and displays a context menu for roll buttons that matches the one DDB uses
 * @param {Event} contextmenuEvent      the event that jQuery gives you from `whatever.on("contextmenu")`
 * @param {Boolean} isDamageRoll        true if this is a damage roll, false if it's a "to hit" roll.
 * @param {function} rollButtonCallback a function that will be called with a string representation of each user selection: sendTo:[everyone|self], rollWith:[advantage|flat|disadvantage], rollAs:[crit|flat]
 */
function display_roll_button_contextmenu(contextmenuEvent, isDamageRoll, rollButtonCallback) {



	// if the button is low enough, move it above the cursor so it doesn't go off screen
	// likewise, if the button is too far right, move it left of the cursor so it doesn't go off screen
	let body = $(contextmenuEvent.currentTarget).closest("body");
	let bodyHeight = body.height();
	let top = (contextmenuEvent.clientY + 320) > bodyHeight ? contextmenuEvent.clientY - 320 : contextmenuEvent.clientY;
	let left = contextmenuEvent.clientX - 200; // the thing is about 215 wide
	overlay.find(".MuiPaper-root").css({
		top: `${top}px`,
		left: `${left}px`
	});
	if (isDamageRoll) {
		// damage rolls allow a "crit damage" option
		overlay.find(".rollwith-options").hide();
	} else {
		// "to hit" rolls allow for advantage|flat|disadvantage options
		overlay.find(".rolldamage-options").hide();
	}

	// clicking outside the contextmenu should close it
	overlay.click(function(event) {
		event.stopPropagation();
		$(event.currentTarget).remove();
	});

	// handle option selection
	overlay.find("div.MuiButtonBase-root").click(function(clickEvent) {
		clickEvent.stopPropagation();
		let checkmark = $(clickEvent.currentTarget).closest("ul").find(".easy-to-find-checkmark");
		$(clickEvent.currentTarget).append(checkmark);
	});
	
	// when the roll button is pressed, figure out what options were selected, and call the callback
	overlay.find("button.MuiButtonBase-root").click(function(clickEvent) {
		clickEvent.stopPropagation();
		let sendTo = "everyone";
		let rollWith = "flat";
		let rollAs = "flat";
		let rollButton = $(clickEvent.currentTarget);
		let allOptionsLists = rollButton.siblings("ul");
		if (allOptionsLists.length > 0) {
			let optionsList = allOptionsLists[0];
			let selectedOptions = $(optionsList).find(".easy-to-find-checkmark").parent();
			selectedOptions.each(function() {
				let op = $(this);
				if (op.attr("data-sendto") !== undefined) {
					sendTo = op.attr("data-sendto");
				}
				if (op.attr("data-rollwith") !== undefined) {
					rollWith = op.attr("data-rollwith");
				}
				if (op.attr("data-rollas") !== undefined) {
					rollAs = op.attr("data-rollas");
				}
			});
		}
		rollButton.closest(".MuiPopover-root").remove();
		rollButtonCallback(sendTo, rollWith, rollAs);
	});

	body.append(overlay);
}

/**
 * When a roll button is right-clicked, this builds and displays a contextmenu, then handles everything related to that contextmenu
 * @param {Event} contextmenuEvent      the event that jQuery gives you from `whatever.on("contextmenu")`
 * @param {String} displayName the name of the player/creature to be displayed in the gamelog
 * @param {String} imgUrl      a url for the image to be displayed in the gamelog for the player/creature that is rolling
 */
function roll_button_contextmenu_handler(contextmenuEvent, displayName, imgUrl) {
	return; // need to rebuild this
	contextmenuEvent.stopPropagation();
	contextmenuEvent.preventDefault();

	let pressedButton = $(contextmenuEvent.currentTarget);
	let expression = pressedButton.attr('data-exp');
	let modifier = pressedButton.attr('data-mod');
	let damageType = pressedButton.attr('data-rolldamagetype');
	let rollType = pressedButton.attr('data-rolltype');
	let actionType = pressedButton.attr('data-actiontype');



	display_roll_button_contextmenu(contextmenuEvent, rollType === "damage", function(sendTo, rollWith, rollAs) {
		if (rollWith == "advantage") {
			expression = "2d20kh1";
		} else if (rollWith == "disadvantage") {
			expression = "2d20kl1";
		}
		if (rollAs == "crit") {
			modifier = `${modifier}CRIT`;
		}
		// displayName, imgUrl, expression, modifier, rollType, damageType, actionType, dmOnly
		roll_our_dice(displayName, imgUrl, expression, modifier, rollType, damageType, actionType, sendTo);
	});
}

/**
 * click handler for all avtt roller buttons
 * @param {event} clickEvent 
 * @param {string} displayName display name to send to combat log
 * @param {string} imgUrl image url to sent to combat log
 */
function roll_button_clicked(clickEvent, displayName, imgUrl) {
	let pressedButton = $(clickEvent.currentTarget);
	let expression = pressedButton.attr('data-exp');
	let modifier = pressedButton.attr('data-mod');
	let damageType = pressedButton.attr('data-rolldamagetype');
	let rollType = pressedButton.attr('data-rolltype');
	let actionType = pressedButton.attr('data-actiontype');
	roll_our_dice(displayName, imgUrl, expression, modifier, rollType, damageType, actionType);
}
