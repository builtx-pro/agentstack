#!/usr/bin/env bash
# Public source only. Keep configuration and bootstrap credentials private.
prepare_bootstrap_helper() {
  local helper=$1
  if [[ ! -f "$helper" || -L "$helper" ]]; then
    printf 'Expected a regular bootstrap helper from the pinned source\n' >&2
    return 1
  fi
  chmod 0644 "$helper"
}
