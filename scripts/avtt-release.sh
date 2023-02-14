#!/bin/bash

if [ -z "$1" ];
then
  echo missing version
  exit 1
fi

VERSION_NAME=$1
VERSION=$(echo "$1" | cut -d "-" -f 1)

echo "Updating manifest with version: $VERSION, version_name: $VERSION_NAME"

sed -ie 's/"version": .*"/"version": '\"${VERSION}\"'/g' manifest.json
sed -ie 's/"version_name": .*"/"version_name": '\"${VERSION_NAME}\"'/g' manifest.json

echo "Making AboveVTT-${VERSION_NAME}.zip"

rm -rf .DS_Store
git archive -o "AboveVTT-${VERSION_NAME}.zip" HEAD
mv AboveVTT-*.zip ../
open ../