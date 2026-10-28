/* LocalWiki — version.js
   The one place the app's version is written. Follows Semantic Versioning (see CHANGELOG.md):
   MAJOR for changes that need action from existing wikis, MINOR for new features, PATCH for fixes.
   To release: change this number, move the CHANGELOG's "Unreleased" notes under the new version,
   commit, and tag it (git tag vX.Y.Z). tests/version.test.js keeps this file and the changelog in step.

   Provides: LocalWiki.version */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  LW.version = '2.9.0';
})();
