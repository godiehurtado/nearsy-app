#!/usr/bin/env node

process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1';

require('@expo/cli/build/bin/cli');
