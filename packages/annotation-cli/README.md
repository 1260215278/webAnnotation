# @web-annotation/cli

Local CLI for previewing and applying webAnnotation patch artifacts
(`web-annotation.patch-artifact.v1`). It reads an exported artifact, previews the
proposed diff, and can apply it through `git apply` behind explicit confirmation
flags.

> Status: prepared for the first npm publish (`0.1.0`); not yet published at the
> time of this commit. Part of the [webAnnotation](https://github.com/1260215278/webAnnotation)
> monorepo.

## Install

Once published, run without installing:

```sh
pnpm dlx @web-annotation/cli preview --file artifact.json
# or: npx @web-annotation/cli preview --file artifact.json
```

## Commands

```sh
web-annotation preview --file <artifact.json>
web-annotation apply   --file <artifact.json> --dry-run
web-annotation apply   --file <artifact.json> --check
web-annotation apply   --file <artifact.json> --yes
web-annotation apply   --file <artifact.json> --yes --branch <branch-name> --commit --message <commit-message>
web-annotation pull    <task-id> --base-url <platform-url> --out <artifact.json> [--token <token>]
```

`apply` never writes to your repository without an explicit `--yes`; run
`--dry-run` or `--check` first. The CLI does not call any AI model.

## License

MIT
