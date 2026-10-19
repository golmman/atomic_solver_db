.PHONY: macos_cleanup
.PHONY: fe_run

macos_cleanup:
	find . -name ".DS_Store" -print -delete

fe_run:
	cd fe && npm install && npm start
