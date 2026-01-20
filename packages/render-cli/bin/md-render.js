#!/usr/bin/env node
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Register tsx loader for TypeScript support
register('tsx/esm', pathToFileURL('./'))

// Run the CLI
import('../src/index.js')
