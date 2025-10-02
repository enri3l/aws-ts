# Changelog

## [0.5.0](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.4.0...aws-ts-v0.5.0) (2025-10-02)


### ✨ Features

* AWS TypeScript CLI foundation with architecture ([c6f64ac](https://github.com/monte3l/aws-ts/commit/c6f64ac4a5f09309a4031f795f3bd8e040f1c0b1))
* AWS TypeScript CLI foundation with architecture ([df26ff7](https://github.com/monte3l/aws-ts/commit/df26ff78c353d81492b988ae6c1e612ec8b48084))
* **ci:** migrate from Codecov to SonarCloud code analysis ([9e370d6](https://github.com/monte3l/aws-ts/commit/9e370d6e0ef23a482ba99116fe2862ae66800462))
* **ci:** release-please with scope enforcement and descriptive changelogs ([16d937e](https://github.com/monte3l/aws-ts/commit/16d937e71dae3cfd3d9f36d426a48082c66f4d40))
* **commands:** add S3 object management commands ([a8c9ca7](https://github.com/monte3l/aws-ts/commit/a8c9ca78af42ad6ede1db1422e882dc3c6ce6824))
* **commands:** add SQS batch operations and DLQ commands ([c67b661](https://github.com/monte3l/aws-ts/commit/c67b6611d3307f01d9726d0894f6a8f1f018c0bf))
* **commands:** add SQS queue and message management commands ([d86af82](https://github.com/monte3l/aws-ts/commit/d86af828f4c60c2e6b141e1a3d7f7ccf134047de))
* **commands:** add SSM Parameter Store and Document Management commands ([d9706ff](https://github.com/monte3l/aws-ts/commit/d9706ffc2ee473c5956f7b53c45f4a353e46cc5f))
* **commands:** add SSM Session Manager and instance discovery commands ([7c54a54](https://github.com/monte3l/aws-ts/commit/7c54a5497c256d345bb9e92a48313b44a3d2827e))
* **commands:** add SSM session resume for network resilience ([731c03b](https://github.com/monte3l/aws-ts/commit/731c03b1710b30618098766e8deb271153eb9ce4))
* **commands:** add SSM SSH, port forwarding, and batch parameters ([8d25ea6](https://github.com/monte3l/aws-ts/commit/8d25ea6b321a069564e2d0f680e376c420083180))
* complete SSM Systems Manager implementation ([c69853c](https://github.com/monte3l/aws-ts/commit/c69853c6bacb3788bf19a22e6afb34a2c472182a))
* configure release-please with clean minimal PR templates ([d53d971](https://github.com/monte3l/aws-ts/commit/d53d971b3dc3f8052125690b6b34a265b1554a25))
* **docs:** update documentation infrastructure and API reference ([cdaf7c7](https://github.com/monte3l/aws-ts/commit/cdaf7c7b0b2352ae2d5af51bdaf72ef326425cda))
* enhance CloudWatch, EventBridge, and Lambda services ([87f5eac](https://github.com/monte3l/aws-ts/commit/87f5eacbb3c45f1e1731bdd0413ee13585d4c5a6))
* **errors:** add secure error sanitization and type utilities ([77ab1c4](https://github.com/monte3l/aws-ts/commit/77ab1c46dbd8284d8435ed57cd28cd65d46c6de8))
* implement API Gateway commands suite ([c6807ae](https://github.com/monte3l/aws-ts/commit/c6807ae6fdcd3f7540016089c6871cb3358d063b))
* implement API Gateway commands suite ([ec4b10b](https://github.com/monte3l/aws-ts/commit/ec4b10b570e45180224c6eca3d4faf620bdb85be))
* implement AWS authentication CLI commands ([8e35506](https://github.com/monte3l/aws-ts/commit/8e3550628de304280f015f7a1aae72958c4f448b))
* implement CI/CD pipeline and release automation ([cedcd09](https://github.com/monte3l/aws-ts/commit/cedcd09bf8c280b229ffdfe7c12fc7137d9bf166))
* implement CloudWatch Logs commands suite ([77ea1f7](https://github.com/monte3l/aws-ts/commit/77ea1f7e2ebadfb7d49a263bd222ca23eb5e5f72))
* implement core AWS authentication library and services ([e399b44](https://github.com/monte3l/aws-ts/commit/e399b44e469c18c8ea28ad223b4d2ac82d85c534))
* implement doctor command system with diagnostics ([c917dcf](https://github.com/monte3l/aws-ts/commit/c917dcfb6600b9121d3bedc4bb9b248d7109ba1c))
* implement DynamoDB commands suite ([2c999bf](https://github.com/monte3l/aws-ts/commit/2c999bf8412fbcb0f496a7cdd179813b43867e9c))
* implement ECS commands suite [skip ci] ([4d37bc0](https://github.com/monte3l/aws-ts/commit/4d37bc0c9fab8f195693ec3612634340f0d56f85))
* implement ECS service foundation infrastructure [skip ci] ([2813272](https://github.com/monte3l/aws-ts/commit/28132725a9f7646880dbc818feb2d52e5dc399ca))
* implement Lambda and EventBridge commands suite ([6608d4c](https://github.com/monte3l/aws-ts/commit/6608d4c179ca4252e57d246e794f81a945b3a7be))
* **lib:** add EC2 error types and schemas [skip ci] ([f00769c](https://github.com/monte3l/aws-ts/commit/f00769ce8818efb3463bf0569be84bed270519b2))
* **lib:** add formatBytes utility for human-readable byte formatting ([2b512a5](https://github.com/monte3l/aws-ts/commit/2b512a593f63d6c634f95d3f8f7b808ce9f0861e))
* **lib:** add S3 validation schemas and error types ([d89d351](https://github.com/monte3l/aws-ts/commit/d89d351c80b5cf2947ea427604c5a5b99faeaaff))
* **lib:** add SQS validation schemas, error types, and service ([4800c43](https://github.com/monte3l/aws-ts/commit/4800c435ecb048b6cab37055ffe1703c5a641c73))
* **lib:** error sanitization, type utilities, and UI display functions ([d990282](https://github.com/monte3l/aws-ts/commit/d990282aad42e4845d60b69aa074a6ce930352d3))
* optimize CI/CD workflows and git hooks for performance ([ea614e3](https://github.com/monte3l/aws-ts/commit/ea614e35d9804e78cabfdfff33c6f80d96de500b))
* optimize test suite performance and reliability ([300acb8](https://github.com/monte3l/aws-ts/commit/300acb8a6dcb976a5dc3eb54a55d8c0e1e4a1923))
* **services:** add CloudWatch Logs analytics service [skip ci] ([a6d850d](https://github.com/monte3l/aws-ts/commit/a6d850d9d08c02ee292464c2df3844def26afdc5))
* **services:** add CloudWatch Logs favorites management [skip ci] ([4c3d663](https://github.com/monte3l/aws-ts/commit/4c3d6639bf706cf68f376b0787f0311e6fe1c6d9))
* **services:** add EC2 instance management [skip ci] ([f2fb1e5](https://github.com/monte3l/aws-ts/commit/f2fb1e5e23718c17ca87b3e11bbbb50261634266))
* **services:** implement S3 service for object operations ([a47097a](https://github.com/monte3l/aws-ts/commit/a47097a20d0faa7f3c6b45553caccbfdd8d207ae))
* **tests:** coverage to 90%+ with Codecov analytics integration ([#25](https://github.com/monte3l/aws-ts/issues/25)) ([0e3f975](https://github.com/monte3l/aws-ts/commit/0e3f97507ca82d4d7f57ccd25bd3d4ad2bffc4b2))


### 🐛 Bug Fixes

* align documentation deployment environment with GitHub Pages system ([c2ca14a](https://github.com/monte3l/aws-ts/commit/c2ca14ab89e43bb2d17f07590a98e46a4f2f9206))
* bypass Git branch checks in pnpm publish --dry-run for CI ([5e4baaa](https://github.com/monte3l/aws-ts/commit/5e4baaaf881b2b137a81324b7617b622c8fd25b4))
* **ci:** exclude bot actors from documentation workflow ([427741e](https://github.com/monte3l/aws-ts/commit/427741e23c9635bca384e4b652b4d9cdd54e2d8b))
* **ci:** ignore test result files to resolve JSR validation failure ([e33be45](https://github.com/monte3l/aws-ts/commit/e33be4599a1c8d6469de760a9c766b697b984d40))
* **ci:** improve SonarCloud integration and workflow configuration ([05666ce](https://github.com/monte3l/aws-ts/commit/05666cee791987113fa293f9ed7184601fbbfb4e))
* **ci:** optimize SonarCloud configuration for TypeScript/Vitest ([d9e0b1e](https://github.com/monte3l/aws-ts/commit/d9e0b1ecd8128149c7f68d4013200c4966e75786))
* **ci:** remove dependency review from release workflow ([78a242a](https://github.com/monte3l/aws-ts/commit/78a242afc1cf1bfb717077a30e55bb9c88b0bd4d))
* **ci:** resolve Codecov configuration issues ([cf05f5d](https://github.com/monte3l/aws-ts/commit/cf05f5d62190b9e9a39cbb33249ce768b835e38e))
* **ci:** resolve Codecov test result upload issues ([3db6876](https://github.com/monte3l/aws-ts/commit/3db6876ca6a9190ca7150fe4d34b9dcedd6c5630))
* **ci:** resolve SonarCloud coverage and maintainability issues ([a6b8440](https://github.com/monte3l/aws-ts/commit/a6b8440f6d7211c08d5a672614a4fd95780208be))
* **ci:** resolve Vitest lcov.info generation for SonarQube ([1e9411f](https://github.com/monte3l/aws-ts/commit/1e9411fce22bb4281949282352b18ba164a1692a))
* **ci:** resolve workflow failures and prevent release blocking ([ccb0c56](https://github.com/monte3l/aws-ts/commit/ccb0c56c4dba83dfb12f1553af66318be832f407))
* **commands:** hide base-command from help output [skip ci] ([0dd837d](https://github.com/monte3l/aws-ts/commit/0dd837d920f04e71cc6db8ddf6b53cac300f4e4e))
* **commands:** resolve enquirer CommonJS import warnings [skip ci] ([6b0b26d](https://github.com/monte3l/aws-ts/commit/6b0b26d40f4a2ea77462af91729c5eae292ddc96))
* **config:** resolve release-please template variable issues ([#20](https://github.com/monte3l/aws-ts/issues/20)) ([c61b1e4](https://github.com/monte3l/aws-ts/commit/c61b1e40667e42ddeded58e4a15778c1dd27e5f4))
* correct package manager in feature-ci.yml security audit ([6fc3e70](https://github.com/monte3l/aws-ts/commit/6fc3e707cc5b5d28a06dd80bc9314b7839922275))
* implement graceful documentation validation in CI workflow ([9fcffe9](https://github.com/monte3l/aws-ts/commit/9fcffe9ce9e24fd3efcee6aa3557421d88782749))
* improve comment compliance with CLAUDE.md guidelines ([93f4e51](https://github.com/monte3l/aws-ts/commit/93f4e51e16b9ca83174566beec78368e4a678e33))
* **lib:** resolve TypeScript compilation errors [skip ci] ([36f46db](https://github.com/monte3l/aws-ts/commit/36f46db707a46c6599f5dcc7410dc719b0e9fdb5))
* move build step before E2E tests in PR validation workflow ([88489b9](https://github.com/monte3l/aws-ts/commit/88489b99858b1483311e18df284014aa43df7b1a))
* remove dependency update monitoring from PR validation workflow ([7f032f1](https://github.com/monte3l/aws-ts/commit/7f032f1fff07449a6af7ddd52ae4108efe80a84a))
* replace invalid pnpm pack --dry-run with pnpm publish --dry-run ([f285b49](https://github.com/monte3l/aws-ts/commit/f285b49781dbed7c7c33e9e0823acbc303c38096))
* replace missing mansagroup/ncu-action with working alternative ([ac3eb8d](https://github.com/monte3l/aws-ts/commit/ac3eb8d7b3e9687e2a1eb246990694ef9e688505))
* resolve JSR version sync and repository migration ([be3f82d](https://github.com/monte3l/aws-ts/commit/be3f82d1865ee8a31f409d883072ae3716a50fd3))
* resolve markdown linting and improve JSR package score ([4cbba45](https://github.com/monte3l/aws-ts/commit/4cbba459411761c2a508667407f98efe3fc49f90))
* resolve pnpm availability in GitHub Actions workflows ([a67cd11](https://github.com/monte3l/aws-ts/commit/a67cd11449db839619fe27249fef7f7a66eccfd4))
* resolve release workflow configuration and package naming issues ([ad839e7](https://github.com/monte3l/aws-ts/commit/ad839e75e736ab8647b5d1f37f2092ae4f463c9d))
* resolve vitest imports and optimize integration test performance ([614d5e4](https://github.com/monte3l/aws-ts/commit/614d5e4ffdc90395c94e389e55f8d3552815b5a3))
* **services:** resolve TypeScript strict optional property compatibility ([22b31df](https://github.com/monte3l/aws-ts/commit/22b31df2fec58610af5d9d5a8788116de00ae884))
* **test:** correct number literal casing in type utilities test ([879b352](https://github.com/monte3l/aws-ts/commit/879b3526d8107b69deb365343a5f54e759d46c33))
* **test:** resolve timing race condition in token expiry edge case test ([685b8f0](https://github.com/monte3l/aws-ts/commit/685b8f0507bb054f37b11953a5a802e7bd2d790d))
* **tests:** resolve all test failures with error handling ([#28](https://github.com/monte3l/aws-ts/issues/28)) ([aefdc3c](https://github.com/monte3l/aws-ts/commit/aefdc3c127d8f85bd848b2eee432a55641e036bc))
* **tests:** resolve coverage reporting and test assertion issues ([c88d6c2](https://github.com/monte3l/aws-ts/commit/c88d6c25d7426f6fd81b9effc5eb48c211eb3f51))
* update documentation workflow for Cloudflare Pages deployment ([1671647](https://github.com/monte3l/aws-ts/commit/16716470e948dfccf21cecfe17bc14540cd37e2f))
* update Node.js engine requirement for broader compatibility ([c79544d](https://github.com/monte3l/aws-ts/commit/c79544debfd61a41b9ba5881b550174b14d95f07))


### ♻️ Code Refactoring

* **commands:** centralize auth error handling ([609cf22](https://github.com/monte3l/aws-ts/commit/609cf22c252917ebdc5b6139e3ade110e3c081dd))
* **commands:** centralize Lambda error formatting ([280ac02](https://github.com/monte3l/aws-ts/commit/280ac029427cb63210ff88082b92b02cd1eb8d0a))
* **commands:** migrate all commands to extend BaseCommand [skip ci] ([5043f00](https://github.com/monte3l/aws-ts/commit/5043f00f40f423de9df3f8a293995c05952367a2))
* **commands:** migrate CloudWatch Logs to shared formatBytes ([5abb9e6](https://github.com/monte3l/aws-ts/commit/5abb9e6522783780ee7e2336f5da2db3e7267e30))
* **commands:** migrate Lambda single-object commands to BaseCommand ([9ef46e5](https://github.com/monte3l/aws-ts/commit/9ef46e51758d731ed33c1d0dbf08e88af4cf6cd6))
* **commands:** migrate S3 to shared formatBytes utility ([786074c](https://github.com/monte3l/aws-ts/commit/786074c72c28f31113f198aef2bc57e903d896c4))
* **commands:** refactor Lambda list commands output formatting ([b6ebf68](https://github.com/monte3l/aws-ts/commit/b6ebf686d06bc8592a38f1fc319d6fd5bd21a16f))
* **commands:** use BaseCommand.commonFlags inheritance ([c5d0c5c](https://github.com/monte3l/aws-ts/commit/c5d0c5c501d2746fb212e54f6bc259af838a449b))
* consolidate TSDoc documentation and error handling [skip ci] ([f4e7674](https://github.com/monte3l/aws-ts/commit/f4e767422c4ea0e729a30eff06cc38a28e89e837))
* improve TypeScript safety across API Gateway implementation ([60b0544](https://github.com/monte3l/aws-ts/commit/60b05448f776a1dfd58e4bc74c16b2a8916ba1d8))
* **lib:** enhance inline comment clarity and descriptiveness ([7a93db0](https://github.com/monte3l/aws-ts/commit/7a93db03c3dd95a808438b7a475f7c920796cb3d))
* **lib:** resolve ESLint violations [skip ci] ([1dc649d](https://github.com/monte3l/aws-ts/commit/1dc649d7319767c1fd4d085bfef32b52cd8df335))
* reduce cognitive complexity and fix code organization ([7a0f0d8](https://github.com/monte3l/aws-ts/commit/7a0f0d863785142a38247f1694b9670599d3fc19))
* remove marketing language from codebase ([e7352b7](https://github.com/monte3l/aws-ts/commit/e7352b7cbd935edba92eff89350452a39931faa2))
* remove marketing language from project documentation ([d0ff4a3](https://github.com/monte3l/aws-ts/commit/d0ff4a341f6e61907ff317c94e45024290807390))


### 📚 Documentation

* add [@module](https://github.com/module) tags to EventBridge and Lambda commands ([0751c3e](https://github.com/monte3l/aws-ts/commit/0751c3ec8be670c87b002afde646be4db120cf41))
* **api:** enhance API reference documentation structure [skip ci] ([7d85961](https://github.com/monte3l/aws-ts/commit/7d85961640d30d766e3d466d49398bdeadab4dfa))
* **commands:** add [@module](https://github.com/module) tags for EC2 commands [skip ci] ([c325f51](https://github.com/monte3l/aws-ts/commit/c325f51aee8e4087b5e4f99666dae416b18f9399))
* **commands:** add [@module](https://github.com/module) tags for Lambda commands [skip ci] ([f33006a](https://github.com/monte3l/aws-ts/commit/f33006a5607b8735fc410e305e31d283ad455e1e))
* **commands:** add [@throws](https://github.com/throws) documentation to EC2 commands [skip ci] ([5b470c0](https://github.com/monte3l/aws-ts/commit/5b470c09ffc1d2edf33f7e7364a5aa247683005f))
* **commands:** standardize [@module](https://github.com/module) tags for API Gateway commands [skip ci] ([08b7964](https://github.com/monte3l/aws-ts/commit/08b7964820d1006dd2bffc0af280180a6dd5e86d))
* **commands:** standardize [@module](https://github.com/module) tags for Auth commands [skip ci] ([8418080](https://github.com/monte3l/aws-ts/commit/8418080c12703a61f124d465cef94b2a41eab46f))
* **commands:** standardize [@module](https://github.com/module) tags for CloudWatch Logs commands [skip ci] ([6dfbd42](https://github.com/monte3l/aws-ts/commit/6dfbd42518e099a4e851e1bfb7fd431edb67e6fb))
* **commands:** standardize [@module](https://github.com/module) tags for DynamoDB commands [skip ci] ([1999a25](https://github.com/monte3l/aws-ts/commit/1999a253b825e0d090f7d2b14acde936a06efc07))
* **commands:** standardize [@module](https://github.com/module) tags for ECS commands [skip ci] ([ad20a65](https://github.com/monte3l/aws-ts/commit/ad20a6554f7a1cfad0bc202544b31a029a9750ba))
* **commands:** standardize [@module](https://github.com/module) tags for EventBridge commands [skip ci] ([16e6a48](https://github.com/monte3l/aws-ts/commit/16e6a481e6dc1a09b3606e480531651d56f9548c))
* enhance TSDoc compliance across core components ([70f455b](https://github.com/monte3l/aws-ts/commit/70f455b51ea350abd86b5850f6185e19543f716a))
* fix markdown linting errors [skip ci] ([41eef2f](https://github.com/monte3l/aws-ts/commit/41eef2fe0516374a83a78b383afc8519b3d11280))
* implement VitePress documentation system with Diataxis framework ([d371f2a](https://github.com/monte3l/aws-ts/commit/d371f2abfd5526c09177f22b5f9475e8ab60f3d0))
* **lib:** add missing [@module](https://github.com/module) tags to 9 library files ([395cf4d](https://github.com/monte3l/aws-ts/commit/395cf4d9268eaae3b6a896e0074d20fb3c6977bf))
* remove testing infrastructure references [skip ci] ([d9c311f](https://github.com/monte3l/aws-ts/commit/d9c311fb1dd7d414c44650f59c4f1826f9b3343b))
* update API documentation for S3 commands ([97a662f](https://github.com/monte3l/aws-ts/commit/97a662f22da754f48b53692d0551ac0feb4b8e3e))
* update ECS implementation documentation ([a0b53eb](https://github.com/monte3l/aws-ts/commit/a0b53eb654741520d487572deb5247f80ec560c8))
* update README and project documentation ([054b979](https://github.com/monte3l/aws-ts/commit/054b979c40a1fa42d4c08d43c660e9a10d0e7f71))

## [0.4.0](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.3.2...aws-ts-v0.4.0) (2025-09-23)


### ✨ Features

* **errors:** add secure error sanitization and type utilities ([fca1ee4](https://github.com/monte3l/aws-ts/commit/fca1ee4b5356e7a27f3ffabaf0b11f08227edbb0))
* **lib:** enhance error sanitization, type utilities, and UI display functions ([3c2d8d5](https://github.com/monte3l/aws-ts/commit/3c2d8d53a21593ac5fe920e5e5f29874c1368482))


### 🐛 Bug Fixes

* **test:** correct number literal casing in type utilities test ([4c70079](https://github.com/monte3l/aws-ts/commit/4c700796e82157d742ab4319af1c756a3097260a))

## [0.3.2](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.3.1...aws-ts-v0.3.2) (2025-09-23)


### 🐛 Bug Fixes

* **tests:** resolve all test failures with enhanced error handling ([#28](https://github.com/monte3l/aws-ts/issues/28)) ([2a98ba1](https://github.com/monte3l/aws-ts/commit/2a98ba1cdc745ceffe83930323d33d2073f65ad0))

## [0.3.1](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.3.0...aws-ts-v0.3.1) (2025-09-23)


### 🐛 Bug Fixes

* **ci:** resolve workflow failures and prevent release blocking ([8f6f105](https://github.com/monte3l/aws-ts/commit/8f6f105dc47444bc12b90851664d49c002137329))

## [0.3.0](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.2.3...aws-ts-v0.3.0) (2025-09-23)


### ✨ Features

* **tests:** enhance coverage to 90%+ with Codecov analytics integration ([#25](https://github.com/monte3l/aws-ts/issues/25)) ([2fe61ca](https://github.com/monte3l/aws-ts/commit/2fe61cae1df0925e6a9a3c564bb48e63aa85ecd5))

## [0.2.3](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.2.2...aws-ts-v0.2.3) (2025-09-22)

### 🐛 Bug Fixes

- resolve markdown linting and improve JSR package score ([ca09df2](https://github.com/monte3l/aws-ts/commit/ca09df2fdd271f11ffcf6a0ac09387093166c73c))

## [0.2.2](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.2.1...aws-ts-v0.2.2) (2025-09-22)

### 🐛 Bug Fixes

- resolve JSR version sync and complete repository migration ([f46fe21](https://github.com/monte3l/aws-ts/commit/f46fe21df69eb1b094dcc4f3a757d99730458054))

## [0.2.1](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.2.0...aws-ts-v0.2.1) (2025-09-22)

### 🐛 Bug Fixes

- **ci:** remove dependency review from release workflow ([acda61e](https://github.com/monte3l/aws-ts/commit/acda61e82d651f500780d7fcb4391263d172307d))

## [0.2.0](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.1.0...aws-ts-v0.2.0) (2025-09-22)

### ✨ Features

- **ci:** enhance release-please with scope enforcement and descriptive changelogs ([3cfb599](https://github.com/monte3l/aws-ts/commit/3cfb59939cc5d8198f3a0e408a46ce639261ed6d))
- implement comprehensive authentication system with 255 passing tests ([fd8f8a5](https://github.com/monte3l/aws-ts/commit/fd8f8a5beea003b9aa694c911d4982c840d2bdf6))
- establish TypeScript CLI foundation with build tooling and architecture ([4bf8106](https://github.com/monte3l/aws-ts/commit/4bf810614d6c05f8bd2383952211ea486c28bef8))
- configure release-please with clean minimal PR templates ([9187b40](https://github.com/monte3l/aws-ts/commit/9187b402a044793eb4156d812885da1b298052f3))
- implement AWS authentication CLI commands ([f3e8838](https://github.com/monte3l/aws-ts/commit/f3e8838a4aabc91fc8578d990c7cca4c3faad716))
- implement comprehensive CI/CD pipeline and release automation ([a62e0ea](https://github.com/monte3l/aws-ts/commit/a62e0ea8fceede9b2732b3def3d829f1be72a4e9))
- implement core AWS authentication library and services ([dd318c4](https://github.com/monte3l/aws-ts/commit/dd318c4d21adca8c92bd0fa4041b47e98cc70d52))
- implement doctor command system with comprehensive diagnostics ([a80a50b](https://github.com/monte3l/aws-ts/commit/a80a50bc92179e2e3d567fb9ea1e3ec117c5434c))
- optimize CI/CD workflows and git hooks for performance ([0bb6072](https://github.com/monte3l/aws-ts/commit/0bb60722bea6eccf131345d097bba9cd82ffcc47))
- optimize test suite performance and reliability ([1aa1caf](https://github.com/monte3l/aws-ts/commit/1aa1caf764d28b2ab1e776c0d057553e0f6c9f36))

### 🐛 Bug Fixes

- align documentation deployment environment with GitHub Pages system ([7b73444](https://github.com/monte3l/aws-ts/commit/7b73444cec208658d228f00bb6e1e99a590b2c37))
- bypass Git branch checks in pnpm publish --dry-run for CI ([2f07256](https://github.com/monte3l/aws-ts/commit/2f072566cbfaae4b6e46ea76fc936368594b34d8))
- **config:** resolve release-please template variable issues
  ([#20](https://github.com/monte3l/aws-ts/issues/20))
  ([51e778c](https://github.com/monte3l/aws-ts/commit/51e778c1844154f94a7622e2be4d4fe5ec6be2cd))
- correct package manager in feature-ci.yml security audit ([46eb2b3](https://github.com/monte3l/aws-ts/commit/46eb2b3d159ffa3c09a6d880232d65a66b2f6eb6))
- implement graceful documentation validation in CI workflow ([c03a3a5](https://github.com/monte3l/aws-ts/commit/c03a3a5d79c02b7274f00d9550326f018ec1b4b1))
- improve comment compliance with CLAUDE.md guidelines ([585d12a](https://github.com/monte3l/aws-ts/commit/585d12a69ff660f0e168309b4401512c18000823))
- move build step before E2E tests in PR validation workflow ([73553e3](https://github.com/monte3l/aws-ts/commit/73553e3ff16f4d8b923e46bb17b9366c12712030))
- remove dependency update monitoring from PR validation workflow ([4004105](https://github.com/monte3l/aws-ts/commit/4004105a5c3c46f6ab2a1d14246edcba314bb08d))
- replace invalid pnpm pack --dry-run with pnpm publish --dry-run ([cd3bb91](https://github.com/monte3l/aws-ts/commit/cd3bb914e23b46779921ccfbcde0e7d52cad4ce9))
- replace missing mansagroup/ncu-action with working alternative ([19af096](https://github.com/monte3l/aws-ts/commit/19af09639a3b5c77139f075a07758378f0806c22))
- resolve pnpm availability in GitHub Actions workflows ([5a77dd3](https://github.com/monte3l/aws-ts/commit/5a77dd3bd0ccfece5da7e5cc3d33340ff990a7c8))
- resolve release workflow configuration and package naming issues ([5640085](https://github.com/monte3l/aws-ts/commit/5640085ae2057a398c39ea04b3bffd5357884598))
- resolve vitest imports and optimize integration test performance ([04f8992](https://github.com/monte3l/aws-ts/commit/04f89924fbe783b21f925fe9d168887e07a99b91))
- update documentation workflow for Cloudflare Pages deployment ([aa34e69](https://github.com/monte3l/aws-ts/commit/aa34e69161d5b8ba01c4145c2df37f1a8f46bd51))
- update Node.js engine requirement for broader compatibility ([792230e](https://github.com/monte3l/aws-ts/commit/792230e39f7036574ba8d3d6e32deb0e8a6965fd))

### 📚 Documentation

- enhance TSDoc compliance across core components ([5b1b557](https://github.com/monte3l/aws-ts/commit/5b1b5579da8f7e522bc06e8ed518e1ea61085abf))
- implement VitePress documentation system with Diataxis framework ([ee85f9a](https://github.com/monte3l/aws-ts/commit/ee85f9a5269d5c98f96d50397b72541589f3cff6))
- update README and project documentation ([90039d6](https://github.com/monte3l/aws-ts/commit/90039d62b79a94392ab70c501717565a4caead42))
