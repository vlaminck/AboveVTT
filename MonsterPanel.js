function init_monster_panel() {
	panel = $("<div id='monster-panel' class='sidepanel-content'></div>");


	iframe = $("<iframe id='iframe-monster-panel'></iframe>");


	iframe.on("load", function(event) {
		$(event.target).contents().find("body").css("zoom", "0.8");
		console.log('sistemo panello mostro');

		$(event.target).contents().find(".encounter-builder__header").hide();
		$(event.target).contents().find(".release-indicator").hide();
		$(event.target).contents().find("#site-main").css("padding", "0");
		$(event.target).contents().find("header").hide();
		$(event.target).contents().find(".main-filter-container").hide();
		$(event.target).contents().find("#mega-menu-target").remove();
		$(event.target).contents().find(".site-bar").remove();
		$(event.target).contents().find(".page-header").remove();
		$(event.target).contents().find(".homebrew-comments").remove();
		$(event.target).contents().find("footer").remove();
		$(event.target).contents().find(".encounter-builder__sidebar").remove();
		$(event.target).contents().find(".dice-rolling-panel").remove();

		var list = $(event.target).contents().find(".monster-listing__body");
		
		// limit the width of monster entries
		list.css("max-width", "400px");
	
		// prevent right click menu on the monster image so we can use our own custom menu
		list.on("contextmenu", ".monster-row__cell--avatar", function(e) {
			e.preventDefault();
		});

		var popupContainer = $(event.target).contents().find("#ddbeb-popup-container");
		init_monster_customization_modal(list, popupContainer);

		// present our own custom monster image menu
		list.on("mousedown", ".monster-row__cell--avatar", function(e) {

			e.stopPropagation();
			e.target = this; // hack per passarlo a token_button

			let monsterImage = $(this);
			let monsterid = monsterImage.parent().parent().attr('id').replace("monster-row-", "");
			let ogImgSrc = monsterImage.find('img').attr('src');

			if ($.find("#custom-img-src-anchor").length == 0) {
				// contextMenu doesn't seem to be able to use elements inside the monster panel iframe so
				// inject an element outside of the monster panel iframe
				// then display a contextMenu from that point.
				$('<span id="custom-img-src-anchor" style="position:absolute;" />').insertBefore(panel);
			}
			$("#custom-img-src-anchor").css("top", e.pageY + "px");
			$("#custom-img-src-anchor").data("monster-id", monsterid);
			$("#custom-img-src-anchor").data("monster-og-img-src", ogImgSrc);

			// open our context menu
			$("#custom-img-src-anchor").contextMenu();
		});

		list.on("contextmenu", "button.monster-row__add-button", function(e) {
			e.preventDefault();
		});

		list.on("mousedown", "button.monster-row__add-button", function(e) {


			e.stopPropagation();
			e.target = this; // hack per passarlo a token_button
			let button = $(this);
			console.log(button.outerHTML());

			img = button.parent().parent().find("img");

			if (img.length > 0) {
				url = img.attr('src');
			}
			else {
				url = "";
			}

			mname = button.parent().parent().find(".monster-row__name").html();
			button.attr("data-name", mname);
			var monsterid = $(this).parent().parent().parent().attr('id').replace("monster-row-", "");

			button.attr('data-img', url);
			button.attr('data-stat', monsterid);

			if (e.button == 2) {
				button.attr('data-hidden', 1)
			}
			else
				button.removeAttr('data-hidden');


			window.StatHandler.getStat(monsterid, function(stat) {
				if (stat.data.sizeId == 5)
					button.attr("data-size", Math.round(window.CURRENT_SCENE_DATA.hpps) * 2);
				if (stat.data.sizeId == 6)
					button.attr("data-size", Math.round(window.CURRENT_SCENE_DATA.hpps) * 3);
				if (stat.data.sizeId == 7)
					button.attr("data-size", Math.round(window.CURRENT_SCENE_DATA.hpps) * 4);
				button.attr('data-hp', stat.data.averageHitPoints);
				button.attr('data-maxhp', stat.data.averageHitPoints);
				button.attr('data-ac', stat.data.armorClass);
				token_button(e);
			})




		});

		list.on("click", ".monster-row", function() { // BAD HACKZZZZZZZZZZZZZ
			var monsterid = $(this).attr("id").replace("monster-row-", "");
			window.StatHandler.getStat(monsterid, function(stat) {
				setTimeout(function() {
					scan_monster($("#iframe-monster-panel").contents().find(".ddbeb-modal"), stat);
					$("#iframe-monster-panel").contents().find(".add-monster-modal__footer").remove();
				}, 1000);

			});



		});
	});
	panel.append(iframe);
	$(".sidebar__pane-content").append(panel);
	iframe.css("width", "100%");

	$("#iframe-monster-panel").height(window.innerHeight - 50);

	$(window).resize(function() {
		$("#iframe-monster-panel").height(window.innerHeight - 50);
	});
	iframe.attr("src", "/encounter-builder");
}

var currentlyCustomizingMonster = {};
function init_monster_customization_modal(list, popupContainer) {
	list.on("click", ".monster-row__cell--drag-handle", function(event) {
		event.preventDefault();
		event.stopPropagation();
		console.log(`popupContainer = ${popupContainer}`);
		let monsterRow = event.target.closest(".monster-row");
		currentlyCustomizingMonster = {
			monsterId: monsterRow.id.replace("monster-row-", ""),
			monsterName: $(monsterRow).find(".monster-row__name").text(),
			defaultImg: parse_img($(monsterRow).find(".monster-row__cell--avatar img").attr("src"))
		};
		display_token_customization_modal();
		display_monster_customization_modal(popupContainer);
	});
	// Allow the user to close thhe modal
	popupContainer.on("click", ".monster-customization-modal .ddbeb-modal__overlay", function() {
		popupContainer.empty();
		currentlyCustomizingMonster = {};
	});	
	popupContainer.on("click", ".monster-customization-modal .ddbeb-modal__close-button", function() {
		popupContainer.empty();
		currentlyCustomizingMonster = {};
	});
	// add the custom url when the user hits the enter key in the add image input
	popupContainer.on("keyup", "input[name='addCustomImage']", function(event) {
		let monsterId = $(event.target).data("monster-id");
		let imgUrl = event.target.value;
		if (event.key == "Enter" && monsterId != undefined && imgUrl != undefined && imgUrl.length > 0) {
			add_custom_image_mapping(monsterId, imgUrl);
			display_monster_customization_modal(popupContainer);
			display_token_customization_modal();
		}
	});
	// add the custom url when the user clicks the add button
	popupContainer.on("click", ".monster-customization-modal button.add-custom-image-button", function(event) {
		console.log(event);
		let monsterId = $(event.target).data("monster-id");
		let urlInputs = $(event.target).closest(".add-monster-modal__footer").find("input");
		if (urlInputs.length == 1) {
			let imgUrl = urlInputs[0].value;
			if (monsterId != undefined && imgUrl != undefined && imgUrl.length > 0) {
				add_custom_image_mapping(monsterId, imgUrl);
				display_monster_customization_modal(popupContainer);
				display_token_customization_modal();
			}
		} else {
			console.warn("failed to find custom image input");
		}
	});
	// remove all custom urls when the user clicks the remove all button
	popupContainer.on("click", ".monster-customization-modal button.remove-all-custom-image-button", function(event) {
		console.log(event);
		if (window.confirm("Are you sure you want to remove all custom images for this monster?")) {
			let monsterId = $(event.target).data("monster-id")
			remove_all_custom_token_images(monsterId);
			display_monster_customization_modal(popupContainer);
			display_token_customization_modal();
		}
	});


	$.contextMenu({
		selector: ".custom-token-image-item",
		items: {
			place: {
				name: "Place Token",
				callback: function(itemKey, opt, originalEvent) {
					let selectedItem = $(opt.$trigger[0]);
					let monsterId = selectedItem.data("monster");
					let monsterName = selectedItem.data("name");
					let imgSrc = selectedItem.find("img").attr("src");
					originalEvent.target = selectedItem;
					place_monster(originalEvent, monsterId, monsterName, imgSrc, false)
				}
			},
			placeHidden: {
				name: "Place Hidden Token",
				callback: function(itemKey, opt, originalEvent) {
					let selectedItem = $(opt.$trigger[0]);
					let monsterId = selectedItem.data("monster");
					let monsterName = selectedItem.data("name");
					let imgSrc = selectedItem.find("img").attr("src");
					originalEvent.target = selectedItem;
					place_monster(originalEvent, monsterId, monsterName, imgSrc, true)
				}
			},
			copy: {
				name: "Copy Url",
				callback: function(itemKey, opt, e) {
					let selectedItem = $(opt.$trigger[0]);
					let imgSrc = selectedItem.find("img").attr("src");
					copy_to_clipboard(imgSrc);
				}
			},
			remove: { 
				name: "Remove",
				callback: function(itemKey, opt, originalEvent) {
					let selectedItem = $(opt.$trigger[0]);
					let monsterId = selectedItem.data("monster");
					let imgIndex = parseInt(selectedItem.data("custom-img-index"));
					remove_custom_token_image(monsterId, imgIndex);
					selectedItem.remove();
				}
			}
		}
	});
}

function display_monster_customization_modal(popupContainer) {
	let monsterId = currentlyCustomizingMonster.monsterId;
	let monsterName = currentlyCustomizingMonster.monsterName;
	let defaultImg = currentlyCustomizingMonster.defaultImg;
	if (monsterId == undefined || monsterName == undefined || defaultImg == undefined) {
		console.warn(`Failed to display monster customization modal; monsterId = ${monsterId}, monsterName = ${monsterName}, defaultImg = ${defaultImg}`)
		return
	}
	
	var imageElements = ``;
	let customImages = get_custom_monster_images(monsterId);
	let footerLabel = "";
	let removeButton = "";
	if (customImages != undefined && customImages.length > 0) {
		for (let i = 0; i < customImages.length; i++) { 
			let imageUrl = parse_img(customImages[i]);
			imageElements += `<div class="custom-token-image-item" data-monster="${monsterId}" data-name="${monsterName}" style="float: left; width:30%"><img alt="token-img" style="transform: scale(0.75); display: inline-block; overflow: hidden; width:100%; height:100%" class="token-image token-round" src="${imageUrl}" /></div>`;
		}
		footerLabel = "Add More Custom Images"
		removeButton = `<div style="width:100%;height:50px;padding:10px"><button class="add-monster-modal__add-button remove-all-custom-image-button" data-monster-id="${monsterId}" style="width:100%;height:100%;background:#e40712">Remove All Custom Images</button></div>`;
	} else {
		imageElements += `<div class="custom-token-image-item" data-monster="${monsterId}" data-name="${monsterName}" style="float: left; width:30%"><img alt="token-img" style="transform: scale(0.75); display: inline-block; overflow: hidden; width:100%; height:100%" class="token-image token-round" src="${defaultImg}" /></div>`;
		footerLabel = "Replace The Default Image"
	}

	let modalHtml = `
		<div class="ddbeb-modal monster-customization-modal">
			<div class="ddbeb-modal__overlay"></div>
			<div class="add-monster-modal ddbeb-modal__content" aria-modal="true" role="dialog" style="width:100%; height:80%">
				<button class="ddbeb-modal__close-button qa-modal_close" title="Close Modal"><svg class="" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g transform="rotate(-45 50 50)"><rect x="0" y="45" width="100" height="10"></rect></g><g transform="rotate(45 50 50)"><rect x="0" y="45" width="100" height="10"></rect></g></svg></button>
				<div class="add-monster-modal__header">
					<div class="add-monster-modal__header-text">
						<div class="add-monster-modal__header-text--name">${monsterName}</div>
						<div class="add-monster-modal__header-text--source">Monster Manual</div>
					</div>
				</div>

				<div class="add-monster-modal__body">
					<div class="add-monster-modal__header-text--name">Token Images</div>
					<div class="custom-token-image-list" style="position: relative; width:100%; height: 90%">
						${imageElements}
					</div>
				</div>
				
				${removeButton}
				<div class="add-monster-modal__footer">
					<div style="width:90%">
						<div role="presentation" class="add-monster-modal__quantity-label"  style="width:100%; padding-left:0px">${footerLabel}</div>
						<input title="${footerLabel}" placeholder="https://..." name="addCustomImage" type="text" style="width:100%" data-monster-id="${monsterId}" />
					</div>
					<button class="add-monster-modal__add-button add-custom-image-button" data-monster-id="${monsterId}">Add</button>
				</div>
			</div>
		</div>
	`;
	
	popupContainer.empty();
	popupContainer.append(modalHtml);
}

function close_token_customization_modal() {
	$(".token-image-modal").remove();
}

function display_token_customization_modal() {

	close_token_customization_modal();

	let sidebarContent = $(".sidebar__pane-content");
	let width = parseInt(sidebarContent.width());
	let top = parseInt(sidebarContent.position().top) + 10;
	console.log(`top: ${top}, width: ${width}`);

	let monsterId = currentlyCustomizingMonster.monsterId;
	let monsterName = currentlyCustomizingMonster.monsterName;
	let defaultImg = currentlyCustomizingMonster.defaultImg;
	if (monsterId == undefined || monsterName == undefined || defaultImg == undefined) {
		console.warn(`Failed to display monster customization modal; monsterId = ${monsterId}, monsterName = ${monsterName}, defaultImg = ${defaultImg}`)
		return
	}

	let footerLabel = "";

	let closeButton = $(`<button class="ddbeb-modal__close-button qa-modal_close" title="Close Modal"><svg class="" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g transform="rotate(-45 50 50)"><rect x="0" y="45" width="100" height="10"></rect></g><g transform="rotate(45 50 50)"><rect x="0" y="45" width="100" height="10"></rect></g></svg></button>`); 
	closeButton.click(close_token_customization_modal);
	let modalHeader = $(`
		<div class="token-image-modal-header">
			<div class="token-image-modal-header-title">${monsterName}</div>
			<div class="token-image-modal-header-subtitle">Token Images</div>
		</div>
	`);

	let modalBody = $(`<div class="token-image-modal-body"></div>`);

	let customImages = get_custom_monster_images(monsterId);
	if (customImages != undefined && customImages.length > 0) {
		for (let i = 0; i < customImages.length; i++) { 
			let imageUrl = parse_img(customImages[i]);
			let tokenDiv = $(`<div class="custom-token-image-item" data-monster="${monsterId}" data-name="${monsterName}" data-custom-img-index="${i}" style="float: left; width:30%"><img alt="token-img" style="transform: scale(0.75); display: inline-block; overflow: hidden; width:100%; height:100%" class="token-image token-round" src="${imageUrl}" /></div>`);
			tokenDiv.click(function() {
				console.log("token click");
			})
			tokenDiv.draggable({
				start: function (event) { 
					console.log("custom-token-image-item drag start")
				},
				drag: function(event, ui) {
					console.log("custom-token-image-item drag drag")
				},
				stop: function (event) { 
					console.log("custom-token-image-item drag stop")
				}
			});
			modalBody.append(tokenDiv)
		}
		footerLabel = "Add More Custom Images"		
	} else {
		let tokenDiv = $(`<div class="custom-token-image-item" data-monster="${monsterId}" data-name="${monsterName}" style="float: left; width:30%"><img alt="token-img" style="transform: scale(0.75); display: inline-block; overflow: hidden; width:100%; height:100%" class="token-image token-round" src="${defaultImg}" /></div>`);
		modalBody.append(tokenDiv)
		footerLabel = "Replace The Default Image"
	}

	let removeAllButton = $(`<button class="token-image-modal-remove-all-button" data-monster-id="${monsterId}"">Remove All Custom Images</button><`);
	let modalFooter = $(`
		<div class="token-image-modal-footer">
			<div style="width:90%">
				<div role="presentation" class="token-image-modal-footer-title" style="width:100%; padding-left:0px">${footerLabel}</div>
				<input title="${footerLabel}" placeholder="https://..." name="addCustomImage" type="text" style="width:100%" data-monster-id="${monsterId}" />
			</div>
			<button class="token-image-modal-add-button" data-monster-id="${monsterId}">Add</button>
		</div>
	`);

	let modalContent = $(`<div class="token-image-modal-content" aria-modal="true" role="dialog"></div>`);
	modalContent.append(closeButton);
	modalContent.append(modalHeader);
	modalContent.append(modalBody);
	modalContent.append(removeAllButton);
	modalContent.append(modalFooter);

	let modal = $(`<div class="token-image-modal" style="width:${width}px;top:${top}px;right:${width}px;left:auto;position:fixed;"></div>`);
	let overlay = $(`<div class="token-image-modal-overlay"></div>`)
	// overlay.click(close_token_customization_modal);
	modal.append(overlay);
	modal.append(modalContent);
	modal.draggable();

	$("#VTTWRAPPER").append(modal);
}

function place_monster(e, monsterId, monsterName, imgSrc, hidden) {
	let button = e.target;
	button.attr('data-stat', monsterId);
	button.attr("data-name", monsterName);
	button.attr('data-img', imgSrc);

	if (hidden) {
		button.attr('data-hidden', 1)
	} else {
		button.removeAttr('data-hidden');
	}

	window.StatHandler.getStat(monsterId, function(stat) {
		if (stat.data.sizeId == 5)
			button.attr("data-size", Math.round(window.CURRENT_SCENE_DATA.hpps) * 2);
		if (stat.data.sizeId == 6)
			button.attr("data-size", Math.round(window.CURRENT_SCENE_DATA.hpps) * 3);
		if (stat.data.sizeId == 7)
			button.attr("data-size", Math.round(window.CURRENT_SCENE_DATA.hpps) * 4);
		button.attr('data-hp', stat.data.averageHitPoints);
		button.attr('data-maxhp', stat.data.averageHitPoints);
		button.attr('data-ac', stat.data.armorClass);
		token_button(e);
	})

}