// openpgpjs calls this function. Defining it surpresses errors.
function showMessages(str) {
	console.log(str);
}

$(function(){
	openpgp.init();
	var keyPair;

	chrome.storage.sync.get('keyPair', function(items) {
		if(Object.keys(items).length == 0) {
			console.log("No key pair found.");
			console.log("Generating key pair...");
			keyPair = openpgp.generate_key_pair(1, 512, "User Name", "");
			console.log("Generated key pair.");
			chrome.storage.sync.set({'keyPair': keyPair});
		}
		else {
			console.log("Retrieved stored keypair");
			keyPair = items.keyPair;
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
		var publicKey = openpgp.read_publicKey(keyPair.publicKeyArmored);

		var encryptedMsg = openpgp.write_encrypted_message(publicKey, messageBox.value);
		console.log(decryptMessage(openpgp.read_message(encryptedMsg)[0]));
		// messageBox.value = encrypted;
	}

	function decryptMessage(msg) {
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

});