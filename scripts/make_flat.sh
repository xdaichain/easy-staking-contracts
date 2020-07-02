#!/usr/bin/env bash

rm -rf flat/*
ROOT=contracts/
FLAT=flat/

FULLPATH="$(cd "$(dirname "$1")"; pwd -P)/$(basename "$1")"

iterate_sources() {
	for FILE in "$FULLPATH""$1"*.sol; do
		if [[ $FILE == *"Migrations.sol"* ]]; then
			continue
		fi
	    [ -f "$FILE" ] || break
	    echo $FILE
	    ./node_modules/.bin/poa-solidity-flattener $FILE $2
	done
}

iterate_sources $ROOT $FLAT
