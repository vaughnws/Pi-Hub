#!/bin/bash

set -e  # Exit on error

GITEA_URL="lol ignore this" # Set to your Gitea instance URL
GITEA_TOKEN="lol ignore this" # Set to your Gitea personal access token
GITHUB_USERNAME="lol ignore this" # Set to your GitHub username
GITHUB_TOKEN="lol ignore this" # Set to your GitHub personal access token

# Get your Gitea user ID (instead of hardcoding uid: 1)
GITEA_UID=$(curl -s -H "Authorization: token $GITEA_TOKEN" \
  "$GITEA_URL/api/v1/user" | jq -r '.id')

echo "Your Gitea UID: $GITEA_UID"

# Get all your GitHub repos (handles pagination)
page=1
repos=""
while true; do
  response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/user/repos?per_page=100&page=$page&type=all") 
  
  page_repos=$(echo "$response" | jq -r '.[].full_name')
  
  if [ -z "$page_repos" ]; then
    break
  fi
  
  repos="$repos"$'\n'"$page_repos"
  ((page++))
done

# Migrate each repo to Gitea
echo "$repos" | while read -r repo; do
  if [ -z "$repo" ]; then
    continue
  fi
  
  repo_name=$(basename "$repo")
  echo "Migrating: $repo -> $repo_name"
  
  # Check if repo is private
  is_private=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$repo" | jq -r '.private')
  
  response=$(curl -s -X POST "$GITEA_URL/api/v1/repos/migrate" \
    -H "Authorization: token $GITEA_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"clone_addr\": \"https://github.com/$repo.git\",
      \"auth_token\": \"$GITHUB_TOKEN\",
      \"uid\": $GITEA_UID,
      \"repo_name\": \"$repo_name\",
      \"mirror\": true,
      \"private\": $is_private,
      \"description\": \"Mirrored from GitHub\"
    }")
  
  # Check for errors
  if echo "$response" | jq -e '.message' > /dev/null 2>&1; then
    echo " Error: $(echo "$response" | jq -r '.message')"
  else
    echo " Success"
  fi
  
  # Be nice to the API
  sleep 1
done

echo "Migration complete!"
