#!/bin/sh
set -e

# Xcode Cloud-provided path to the cloned repo.
REPO_ROOT="$CI_PRIMARY_REPOSITORY_PATH"

echo "Initializing git submodules..."
git -C "$CI_PRIMARY_REPOSITORY_PATH" submodule update --init --recursive

echo "Installing Node.js..."
brew install node

echo "Installing pnpm..."
npm install -g pnpm@10

cd "$REPO_ROOT"

echo "Installing JS dependencies..."
pnpm install --no-frozen-lockfile

echo "Building web assets and syncing Capacitor (runs pod install via cap sync)..."
pnpm run build

# cap sync already runs `pod install`, but run again explicitly to be safe
# in case build is short-circuited.
echo "Ensuring CocoaPods are installed..."
cd "$REPO_ROOT/ios/App"
pod install

echo "ci_post_clone complete."
