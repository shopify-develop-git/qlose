# Templates held back

Nothing is held back at the moment -- every page template is in `templates/`
and offered in the admin. This note stays because the technique is worth
keeping, and because of what it does *not* do, which is written up under
"What holding one back cannot undo" below.

The rest describes the technique for a page template that is finished, or
nearly, but should not be part of the theme yet.

Shopify builds the list of page templates by scanning `templates/`. There is no
flag that hides one: a `page.<suffix>.json` sitting in that folder is offered in
the admin and can be assigned to a page, and nothing in the file can say
otherwise. So the way to hold one back is to keep it out of that folder.

This directory sits under `docs/`, which is not a theme directory, so the CLI
leaves it alone: it packages and uploads only `assets`, `blocks`, `config`,
`layout`, `locales`, `sections`, `snippets` and `templates`. That is the same
reason the rest of `docs/` and `bin/` have never been part of the theme. The
files here stay under version control and are otherwise untouched.

It is under `docs/` rather than at the top level for a second reason: a
`templates-off/` beside `templates/` made `shopify theme check` lose its way,
reporting 455 warnings across 178 files that had nothing to do with the move.

## Bringing one back

```sh
git mv docs/templates-off/page.about.json templates/
```

It is a template again on the next `shopify theme dev` or `shopify theme push`,
and appears in the admin as "about". To hold it back again, move it the other
way.

All of them at once:

```sh
git mv docs/templates-off/page.*.json templates/
```

## What is not here

The homepage, the product templates and every stock Horizon template are still
in `templates/` and unaffected.

`templates/blog.journal.json` is also still there — it is a blog template rather
than a page template, so it was left on. Move it here the same way if it should
be held back too.

Note that a template is not a URL. `page.about.json` only takes effect when a
page in the admin is assigned the "about" suffix, so holding one back does not
remove a page that already exists; it removes the option to point one at this
design.

## What holding one back cannot undo

Moving a template out of `templates/` stops it being *uploaded*. It does not
delete the copy already sitting in the theme on the store: the GitHub
integration adds and updates files, and leaves removed ones where they are.

So a template held back after it has been pushed once keeps being offered in
the admin, at whatever version was last uploaded -- a stale copy the repo has
no further say over. Deleting it from the theme as well, through the admin's
code editor or `shopify theme delete-file`, is a separate step.

Hold a template back before its first push and the question never arises.
