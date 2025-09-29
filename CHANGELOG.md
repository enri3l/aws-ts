# Changelog

## [0.5.0](https://github.com/monte3l/aws-ts/compare/aws-ts-v0.4.0...aws-ts-v0.5.0) (2025-09-29)


### ✨ Features

* **ci:** migrate from Codecov to SonarCloud code analysis ([8c5aa13](https://github.com/monte3l/aws-ts/commit/8c5aa1357932878e1ebc62776b757514fdb06e55))
* **ci:** release-please with scope enforcement and descriptive changelogs ([0791ff7](https://github.com/monte3l/aws-ts/commit/0791ff7e1a9ea6ce4585e82d84912847ca084aa5))
* complete AWS TypeScript CLI foundation with comprehensive architecture ([c24abca](https://github.com/monte3l/aws-ts/commit/c24abca5c99406817c05f85b9b24bb605705bfab))
* complete AWS TypeScript CLI foundation with comprehensive architecture ([8a83b22](https://github.com/monte3l/aws-ts/commit/8a83b22fdded8464707687781599c1f506007b21))
* configure release-please with clean minimal PR templates ([91c965b](https://github.com/monte3l/aws-ts/commit/91c965b4a2ebc05b695b56f054d9dad450deed09))
* **docs:** update documentation infrastructure and API reference ([0521608](https://github.com/monte3l/aws-ts/commit/052160876a3701582960421454bf33b94fb3d83b))
* enhance CloudWatch, EventBridge, and Lambda services ([cb1dee7](https://github.com/monte3l/aws-ts/commit/cb1dee754dbf9ff1febfa3a166a8c2c9a11f2b42))
* **errors:** add secure error sanitization and type utilities ([12ea138](https://github.com/monte3l/aws-ts/commit/12ea138ff08a6c7d95991391523aec7561f5806f))
* implement API Gateway commands suite ([025d41b](https://github.com/monte3l/aws-ts/commit/025d41b320a969d701febaf47d54f7100d9dede2))
* implement API Gateway commands suite ([a2b8065](https://github.com/monte3l/aws-ts/commit/a2b806588336e508e9a6a2e8805c7659ae303fbf))
* implement AWS authentication CLI commands ([5655108](https://github.com/monte3l/aws-ts/commit/5655108cd7a927c723f1ba94542721620a2d2153))
* implement CloudWatch Logs commands suite ([9a0749a](https://github.com/monte3l/aws-ts/commit/9a0749aa523c1b1dfc1a3b8d7d87ae7d86d3a94c))
* implement comprehensive CI/CD pipeline and release automation ([e724a73](https://github.com/monte3l/aws-ts/commit/e724a7326f3ce789bb8bd03a582af752bece9c74))
* implement core AWS authentication library and services ([2c0bc03](https://github.com/monte3l/aws-ts/commit/2c0bc03b369aed8b2939ddcec7c2d3f1bdd52bd7))
* implement doctor command system with diagnostics ([0e97fab](https://github.com/monte3l/aws-ts/commit/0e97fab17b8c75c2537300e672c74583798f3193))
* implement DynamoDB commands suite ([9b50efa](https://github.com/monte3l/aws-ts/commit/9b50efabfd004ab95c85424721b54c8775d6ea3d))
* implement ECS commands suite [skip ci] ([2fd9386](https://github.com/monte3l/aws-ts/commit/2fd9386fad275059d8be22a2cf25771688b28109))
* implement ECS service foundation infrastructure [skip ci] ([ce1b857](https://github.com/monte3l/aws-ts/commit/ce1b857b81ef108f27c658ff6e71f25084e2b342))
* implement Lambda and EventBridge commands suite ([72b173f](https://github.com/monte3l/aws-ts/commit/72b173f5764a5ed758d128b7a438170f01268a05))
* **lib:** error sanitization, type utilities, and UI display functions ([3661acc](https://github.com/monte3l/aws-ts/commit/3661acc68d5aaa4f524a15eef50efc254e240906))
* optimize CI/CD workflows and git hooks for performance ([5437973](https://github.com/monte3l/aws-ts/commit/5437973e957f1129b35360e585854966067c7cf2))
* optimize test suite performance and reliability ([46073ce](https://github.com/monte3l/aws-ts/commit/46073ce53a4109531ec990d40c4f2393e129d1d9))
* **tests:** coverage to 90%+ with Codecov analytics integration ([#25](https://github.com/monte3l/aws-ts/issues/25)) ([8581787](https://github.com/monte3l/aws-ts/commit/8581787e056c7d202cf84f428a734c1541e4e805))


### 🐛 Bug Fixes

* align documentation deployment environment with GitHub Pages system ([3bbc8e4](https://github.com/monte3l/aws-ts/commit/3bbc8e459d85a223da4c935464a521b19334ccf0))
* bypass Git branch checks in pnpm publish --dry-run for CI ([e56ef1a](https://github.com/monte3l/aws-ts/commit/e56ef1a931d46d5ee8be5db1833129d4b1a20e7b))
* **ci:** exclude bot actors from documentation workflow ([e78747e](https://github.com/monte3l/aws-ts/commit/e78747e35ccc1626dd1a1a0d058a19615d300e33))
* **ci:** ignore test result files to resolve JSR validation failure ([616e0d3](https://github.com/monte3l/aws-ts/commit/616e0d31dd30f51363182250f21b7069966916ab))
* **ci:** improve SonarCloud integration and workflow configuration ([0707f48](https://github.com/monte3l/aws-ts/commit/0707f48ffd0d9432ce2e1ec73627acf564f5e16b))
* **ci:** optimize SonarCloud configuration for TypeScript/Vitest ([eacd182](https://github.com/monte3l/aws-ts/commit/eacd18226b75e43a27c689b34a523ffce92c565f))
* **ci:** remove dependency review from release workflow ([5ed20b9](https://github.com/monte3l/aws-ts/commit/5ed20b92ff1c2df3a53218d826e624193d959e0c))
* **ci:** resolve Codecov configuration issues ([5b98c21](https://github.com/monte3l/aws-ts/commit/5b98c21d50c7fb648668b1b9cabc60bd93b4bd43))
* **ci:** resolve Codecov test result upload issues ([03b8d29](https://github.com/monte3l/aws-ts/commit/03b8d29d69a97303ef3f9e0f5a83ce2bc1762777))
* **ci:** resolve SonarCloud coverage and maintainability issues ([ed904b7](https://github.com/monte3l/aws-ts/commit/ed904b7fc338b1746a601ec663c0fccdac5e9c27))
* **ci:** resolve Vitest lcov.info generation for SonarQube ([65282e0](https://github.com/monte3l/aws-ts/commit/65282e05982c6ff388027c3a0c813443535956c8))
* **ci:** resolve workflow failures and prevent release blocking ([ce9bead](https://github.com/monte3l/aws-ts/commit/ce9bead6b1d86f0667f0d65d239b09b313040128))
* **config:** resolve release-please template variable issues ([#20](https://github.com/monte3l/aws-ts/issues/20)) ([c31c687](https://github.com/monte3l/aws-ts/commit/c31c6871575ed00baf9292b1da9ddc4ac8ce3f8d))
* correct package manager in feature-ci.yml security audit ([f7e0599](https://github.com/monte3l/aws-ts/commit/f7e0599f43a3e4a4f2fcd07dac1948ddd96427fc))
* implement graceful documentation validation in CI workflow ([40ef711](https://github.com/monte3l/aws-ts/commit/40ef7118fff8f96a27643046421867ba369bb8d4))
* improve comment compliance with CLAUDE.md guidelines ([fbc1670](https://github.com/monte3l/aws-ts/commit/fbc1670a0e3a5079c8b99a81e3c0f8e86f65f8da))
* move build step before E2E tests in PR validation workflow ([60535f9](https://github.com/monte3l/aws-ts/commit/60535f9615b67729afff9beb86cab6b4c8ef78fc))
* remove dependency update monitoring from PR validation workflow ([ebc6662](https://github.com/monte3l/aws-ts/commit/ebc666285dca42948d56aa1886f843500167d782))
* replace invalid pnpm pack --dry-run with pnpm publish --dry-run ([ec84ac1](https://github.com/monte3l/aws-ts/commit/ec84ac1854b04448d47e26a9cbb1f760215018dd))
* replace missing mansagroup/ncu-action with working alternative ([0161acb](https://github.com/monte3l/aws-ts/commit/0161acbed2f85cdc2fc9433da7e742bce5f5eb2b))
* resolve JSR version sync and repository migration ([2d1553e](https://github.com/monte3l/aws-ts/commit/2d1553e1845543e8eed0a81f2fa0371e67864563))
* resolve markdown linting and improve JSR package score ([03904b2](https://github.com/monte3l/aws-ts/commit/03904b258cdd17f11f9771c2ebdd1a9cf3e933f3))
* resolve pnpm availability in GitHub Actions workflows ([64741ca](https://github.com/monte3l/aws-ts/commit/64741cab7911dc02985e6c0b5c461704f0d3876c))
* resolve release workflow configuration and package naming issues ([a00da63](https://github.com/monte3l/aws-ts/commit/a00da635b7752aa9808cb58bdbdecf1fe768f04d))
* resolve vitest imports and optimize integration test performance ([a951ad8](https://github.com/monte3l/aws-ts/commit/a951ad86383ce3e8b9f79f168e1991855e2c1b8a))
* **services:** resolve TypeScript strict optional property compatibility ([26af748](https://github.com/monte3l/aws-ts/commit/26af7483b22362365745c7425129868e96d82dc5))
* **test:** correct number literal casing in type utilities test ([fd5b0c8](https://github.com/monte3l/aws-ts/commit/fd5b0c86cdfba494fc457b4237699d5fbecb55ff))
* **test:** resolve timing race condition in token expiry edge case test ([f41f53b](https://github.com/monte3l/aws-ts/commit/f41f53b152361f44285200440609d87baaca78bf))
* **tests:** resolve all test failures with error handling ([#28](https://github.com/monte3l/aws-ts/issues/28)) ([36418d7](https://github.com/monte3l/aws-ts/commit/36418d78273007df9ac891cf19f70fb024cf1f2e))
* **tests:** resolve coverage reporting and test assertion issues ([671d299](https://github.com/monte3l/aws-ts/commit/671d29934a1971259b53890fb5e50fa053c526bc))
* update documentation workflow for Cloudflare Pages deployment ([4959eaf](https://github.com/monte3l/aws-ts/commit/4959eaf291f610be4e979cab383cf03958b9bd8e))
* update Node.js engine requirement for broader compatibility ([f305fe2](https://github.com/monte3l/aws-ts/commit/f305fe2154da14717774e2cfd87479e6e747730b))


### ♻️ Code Refactoring

* improve TypeScript safety across API Gateway implementation ([ca5c2a7](https://github.com/monte3l/aws-ts/commit/ca5c2a7013f05ba8f26c0b111f576ff3fe1fe1ad))
* reduce cognitive complexity and fix code organization ([da2637e](https://github.com/monte3l/aws-ts/commit/da2637e61a378185ebfa0e1323f0ab9420be5c6c))
* remove marketing language from project documentation ([aae6f9f](https://github.com/monte3l/aws-ts/commit/aae6f9fbd6d0e34ba394a7b0d38b6eed506faf66))


### 📚 Documentation

* enhance TSDoc compliance across core components ([412f0a0](https://github.com/monte3l/aws-ts/commit/412f0a0a20e94f86b034f2a03cd24d4c61a58f06))
* implement VitePress documentation system with Diataxis framework ([53b10f5](https://github.com/monte3l/aws-ts/commit/53b10f5726f4286dc34368662e9477106e8163ac))
* update ECS implementation documentation ([2baa8fa](https://github.com/monte3l/aws-ts/commit/2baa8fa7c7af9b6366aa748486ae8b157a7a9dd7))
* update README and project documentation ([f74d2fb](https://github.com/monte3l/aws-ts/commit/f74d2fbd531d76230ee2760b69d47a654dfe49fc))

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
