#!/bin/sh
# Xcode build phase: force OTA live updates off in Debug builds.
#
# TestFlight / App Store archives always build the Release configuration, so
# this guarantees local Xcode runs (and `cap run ios`) never pull OTA bundles,
# no matter which capacitor.config.ts branch was last synced. Patches the
# capacitor.config.json inside the built product only — the source copy in
# ios/App/App/ is untouched.
set -e

if [ "$CONFIGURATION" != "Debug" ]; then
  exit 0
fi

CONFIG_JSON="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/capacitor.config.json"

if [ ! -f "$CONFIG_JSON" ]; then
  echo "warning: $CONFIG_JSON not found — LiveUpdate left enabled in this Debug build"
  exit 0
fi

python3 - "$CONFIG_JSON" <<'EOF'
import json, sys

path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)

live_update = cfg.get("plugins", {}).get("LiveUpdate")
if live_update is not None:
    live_update["autoUpdateStrategy"] = "none"
    # 0 also disables the ready()/rollback watchdog, which is meaningless
    # without OTA bundles.
    live_update["readyTimeout"] = 0
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2)
    print("Debug build: LiveUpdate autoUpdateStrategy forced to 'none'")
EOF
