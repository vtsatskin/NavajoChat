// openpgpjs calls this function. Defining it surpresses errors.
function showMessages(str) {
	console.log(str);
}

$(function(){
	var handshakeRequestString = "I'm using Navajo to protect our privacy from online survelience systems. \
								 You can find out more information at http://placeholder.secure"
	openpgp.init();
	var keyPair;
	var friendPublicKeys = {};
	var friendPublicArmoredKeys = {};

	chrome.storage.sync.get(['privateKey', 'publicKey'], function(items) {
		if(Object.keys(items).length == 0) {
			console.log("No key pair found.");
			console.log("Generating key pair...");
			keyPair = openpgp.generate_key_pair(1, 2048, "User Name", "");
			console.log("Generated key pair.");

			// Storing armored text to reduce size of data due to Chrome Storage constraints
			chrome.storage.sync.set({
				'privateKey': keyPair.privateKeyArmored,
				'publicKey': keyPair.publicKeyArmored,
			});

			console.log('Public key:');
			console.log(keyPair.publicKeyArmored);
		}
		else {
			// Reconstructing keyPair to be similiar to output from openpgp.generate_key_pair()
			var privateKey = openpgp.read_privateKey(items.privateKey)[0];
			keyPair = {
				privateKey: privateKey,
				privateKeyArmored: items.privateKey,
				publicKeyArmored: items.publicKey,
			}
			console.log("Retrieved stored keypair");
		}
	});

	chrome.storage.sync.get('friendPublicKeys', function(items) {
		if(Object.keys(items).length) {
			friendPublicArmoredKeys = items.friendPublicKeys;
			friendPublicKeys = Object.keys(items.friendPublicKeys).map(function(key) {
				openpgp.read_publicKey(items.friendPublicKeys[key])[0];
			});
		}
	});

	var messageBox = document.querySelector("[name=message_body]");

	function handleKeyDown(e) {
		var sendWithButton = document.querySelector("._1rh");
		if(e.which == 13) {
			encryptMessage();
		}
	}
	messageBox.parentNode.addEventListener('keydown', handleKeyDown, true);

	function encryptMessage() {
		if(keyPair == null) return;

		var friendUserId = findFriendId();
		var friendPublicKey = friendPublicKeys[friendUserId];
		var publicKey = openpgp.read_publicKey(keyPair.publicKeyArmored);
		encryptedMsg = openpgp.write_encrypted_message(publicKey, messageBox.value);

		if(friendPublicKey) {
			publicKey = friendPublicKeys[friendUserId];
			encryptedMsg += "\n" + openpgp.write_encrypted_message(publicKey, messageBox.value);
		}
		
		messageBox.value = encryptedMsg;
	}

	function decryptMessage(str) {
		var msg = openpgp.read_message(str)[0];
		var keymat = null;
		var sesskey = null;
		var priv_key = keyPair.privateKey;
		// Find the private (sub)key for the session key of the message
		for (var i = 0; i< msg.sessionKeys.length; i++) {
			if (priv_key.privateKeyPacket.publicKey.getKeyId() == msg.sessionKeys[i].keyId.bytes) {
				keymat = { key: priv_key, keymaterial: priv_key.privateKeyPacket};
				sesskey = msg.sessionKeys[i];
				break;
			}
			for (var j = 0; j < priv_key.subKeys.length; j++) {
				if (priv_key.subKeys[j].publicKey.getKeyId() == msg.sessionKeys[i].keyId.bytes) {
					keymat = { key: priv_key, keymaterial: priv_key.subKeys[j]};
					sesskey = msg.sessionKeys[i];
					break;
				}
			}
		}
		if (keymat != null) {
			if (!keymat.keymaterial.decryptSecretMPIs('')) {
				console.log("Password for secrect key was incorrect!");
				return;

			}
			return msg.decrypt(keymat, sesskey);
		} else {
			console.log("No private key found!");
		}

	    return false;
	}

	var messages = document.querySelector("#webMessengerRecentMessages");
	messages.addEventListener("DOMNodeInserted", function (e) {
		var messageGroup = $(e.target);
		if(messageGroup.hasClass('webMessengerMessageGroup')) {
			findAndSavePublicKeys(messageGroup);
			decryptMessageBox(messageGroup);
		}

	}, false);

	function findAndSavePublicKeys(messageGroup) {
		var hovercardLink = messageGroup.find('a[data-hovercard]');
		var match = hovercardLink.data('hovercard').match(/[0-9]{3,}/);
		var currentUsersMessage = match && match[0] == findCurrentUserId();

		var cryptoText = "";
		var cryptoNodes = [];
		var isInsideCryptoBlock = false;
		messageGroup.find('p').each(function(i, node){
			var text = $(node).text();
			if(containsKeyHeader(text)) {
				cryptoNodes.push($(node));
				cryptoText += text + "\n\n";
				isInsideCryptoBlock = true;
			}
			else if(containsKeyFooter(text)) {
				cryptoNodes.push($(node));
				cryptoText += text;

				cryptoNodes.forEach( function(e) { e.remove(); });
				if(messageGroup.find('p').length == 0) {
					// No more non-crypto messages left.
					messageGroup.remove();
				}

				if(!currentUsersMessage) {
					var publicKey = openpgp.read_publicKey(cryptoText)[0];
					if(publicKey) {
						var friendId = findFriendId();
						friendPublicKeys[friendId] = publicKey;
						friendPublicArmoredKeys[friendId] = cryptoText;

						messageGroup.remove();
						console.log("found friend's public key");
						chrome.storage.sync.set({ 'friendPublicKeys': friendPublicArmoredKeys });
					}
				}

				cryptoText = "";
				cryptoNodes = [];
				isInsideCryptoBlock = false;
			}
			else if(isInsideCryptoBlock) {
				cryptoNodes.push($(node));
				cryptoText += text + "\n";
			}
		});
	}

	function decryptMessageBox(messageGroup) {
		var cryptoText = "";
		var cryptoNodes = [];
		var isInsideCryptoBlock = false;
		messageGroup.find('p').each(function(i, node){
			var text = $(node).text();
			if(containsCryptoHeader(text)) {
				cryptoNodes.push($(node));
				cryptoText += text + "\n\n";
				isInsideCryptoBlock = true;
			}
			else if(containsCryptoFooter(text)) {
				cryptoNodes.push($(node));
				cryptoText += text;

				var decryptedMessage = decryptMessage(cryptoText);
				if(decryptedMessage) {
					cryptoNodes.forEach( function(e, i) {
						if(i == cryptoNodes.length - 1) {
							e.text(decryptedMessage);
							var container = messageGroup.find('.timestamp').parents('.rfloat');
							container.prepend('<a class="mrs _9k" role="button" aria-label="Encrypted with Navajo" data-hover="tooltip"><img class="secure-icon" src="' + chrome.extension.getURL("img/secure.png") + '"></a>');
						}
						else {
							e.remove();
						}
					});
				}
				else {
					cryptoNodes.forEach( function(e) { e.remove(); });
				}

				cryptoText = "";
				cryptoNodes = [];
				isInsideCryptoBlock = false;
			}
			else if(isInsideCryptoBlock) {
				cryptoNodes.push($(node));
				cryptoText += text + "\n";
			}
		});
	}

	function containsCryptoHeader(str) {
		return str.search(/-----BEGIN PGP MESSAGE-----\n/) != -1;
	}

	function containsCryptoFooter(str) {
		return str.search(/-----END PGP MESSAGE-----/) != -1;
	}

	function containsKeyHeader(str) {
		return str.search(/-----BEGIN PGP PUBLIC KEY BLOCK-----/) != -1;
	}

	function containsKeyFooter(str) {
		return str.search(/-----END PGP PUBLIC KEY BLOCK-----/) != -1;
	}

	function findFriendId() {
		var headerNameLink = $("#webMessengerHeaderName a");
		return headerNameLink.data('hovercard').match(/[0-9]+/)[0];
	}

	var cachedCurrentUserId = null;
	function findCurrentUserId() {
		if(!cachedCurrentUserId) {
			var linkWithId = $("a[ajaxify^='/ajax/notifications/get.php?user=']");
			cachedCurrentUserId = linkWithId.attr('ajaxify').match(/[0-9]+/)[0];
		}
		
		return cachedCurrentUserId;
	}

});