.PHONY: run build rebuild

run:
	db/run.sh

build:
	db/build.sh

rebuild:
	db/build.sh --rebuild
