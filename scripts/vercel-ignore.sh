#!/bin/sh
# Vercel's "Ignored Build Step" (vercel.json ignoreCommand): exit 0 skips the build, 1 builds.
# Skip only when nothing but docs changed since this branch's last deployment; build
# whenever that can't be told (a first deployment, or a commit outside Vercel's shallow clone).
prev="$VERCEL_GIT_PREVIOUS_SHA"
if [ -n "$prev" ] && git cat-file -e "$prev^{commit}" 2>/dev/null &&
  git diff --quiet "$prev" HEAD -- . ':(exclude)README.md' ':(exclude)docs' ':(exclude).github' ':(exclude)LICENSE' ':(exclude).env.example'; then
  echo "Only docs changed since $prev: skipping the build."
  exit 0
fi
exit 1
