# Contributing

Contributions that improve BoardDocs scraping, configuration validation, or public-record accuracy are welcome.

## Setup

```bash
git clone https://github.com/ashleyrchen/rcsd-meetings.git
cd rcsd-meetings
npm ci
npm test
```

## Guidelines

- Keep district-specific values in `config/boarddocs/*.yaml`.
- Include a direct official source for corrections to public meeting data.
- Do not add credentials or private records.
- Keep commits focused and use merge commits rather than squash merges.
- Run `npm test` before opening a pull request.
