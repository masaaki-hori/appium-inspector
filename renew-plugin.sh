#!/bin/sh
appium plugin uninstall inspector 
npm install
npm run build 
appium plugin install --source local /Volumes/Projects/VSCodeProjects/cygnus/appium/appium-inspector/plugins 2>&1

