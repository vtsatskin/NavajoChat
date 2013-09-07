$(function(){
	var messageBox = document.querySelector("[name=message_body]");
	var handleKeyDown = function (e) {
		var sendWithButton = document.querySelector("._1rh");
		if(!sendWithButton && e.which == 13) {
			var messageBox = document.querySelector("[name=message_body]");
			messageBox.value = "a changed value";
		}
	}
	messageBox.parentNode.addEventListener('keydown', handleKeyDown, true);
});