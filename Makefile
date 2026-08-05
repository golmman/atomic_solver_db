.PHONY: db_run db_build db_rebuild fe_run

db_run:
	db/run.sh

db_build:
	db/build.sh

db_rebuild:
	db/build.sh --rebuild

fe_run:
	cd fe; npm install; npm start
