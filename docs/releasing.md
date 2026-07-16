# Releasing the public packages

Both packages currently share a release version. A pull request that changes the
public contract, CLI, templates, or examples must update both package versions
and document compatibility-impacting changes.

After the pull request merges to `main`, `publish.yml` reruns every quality gate,
packs the packages, and queries npm for the declared versions. Existing versions
are skipped. New versions publish in dependency order:

1. `@opsrabbit/plugin-sdk`
2. wait until that SDK version is visible in npm
3. `@opsrabbit/create-plugin`

## npm setup

1. Confirm the `@opsrabbit` npm organization/scope is controlled by OpsRabbit.
2. Create the GitHub environment `npm-production`, restrict deployment to `main`,
   and bind the npm trusted-publisher configuration to that environment. A separate
   environment reviewer is optional because the version bump, required PR review,
   and required CI checks are the release approval.
3. Bootstrap any package that does not yet exist using an npm granular access
   token stored only as the environment secret `NPM_TOKEN`. Never commit or paste
   the token into an issue. The SDK `0.1.0` exists; the creator CLI is first
   created by the aligned `0.2.0` release.
4. In each npm package's settings, configure GitHub Actions trusted publishing for:
   - organization: `Ops-Rabbit`
   - repository: `plugin-platform`
   - workflow: `publish.yml`
   - environment: `npm-production`
5. Merge a patch-version release and verify OIDC publishing and provenance.
6. Delete `NPM_TOKEN` from GitHub and revoke it in npm.

The publishing job uses a GitHub-hosted runner and `id-token: write`, as required
for npm trusted publishing. It never publishes from pull requests or unreviewed
branches. The repository and npm packages must remain public for public npm
provenance attestations.

If the SDK publishes but the CLI fails, rerun the workflow after correcting the
failure. The release script skips the immutable SDK version and continues with
the missing CLI version.

After `0.2.0` is verified, deprecate SDK `0.1.0` with an upgrade message because
its experimental manifest and registration shape is not supported by the
OpsRabbit host adapter.
