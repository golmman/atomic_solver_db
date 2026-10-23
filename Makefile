.PHONY: macos_cleanup
.PHONY: download_proofdb fe_run

macos_cleanup:
	find . -name ".DS_Store" -print -delete

download_proofdb:
	data/download_proofdb.sh

fe_run:
	cd fe && npm install && npm start
