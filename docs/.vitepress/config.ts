/**
 * VitePress configuration for AWS TypeScript CLI documentation
 *
 * Configures VitePress documentation site with IBM Carbon theme,
 * TypeDoc integration, and Diataxis framework structure for
 * comprehensive CLI documentation.
 *
 */

import { defineConfig } from "vitepress";

export default defineConfig({
  title: "AWS TypeScript CLI",
  description: "TypeScript-based CLI for AWS operations with modular architecture",

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Tutorials", link: "/tutorials/" },
      { text: "How-To Guides", link: "/how-to/" },
      { text: "Reference", link: "/reference/" },
      { text: "Explanation", link: "/explanation/" },
      { text: "API", link: "/api/" },
    ],

    sidebar: {
      "/tutorials/": [
        {
          text: "Tutorials",
          items: [
            { text: "Getting Started", link: "/tutorials/getting-started" },
            { text: "First Commands", link: "/tutorials/first-commands" },
          ],
        },
      ],

      "/how-to/": [
        {
          text: "How-To Guides",
          items: [
            { text: "CLI Installation", link: "/how-to/cli-installation" },
            { text: "Configuration", link: "/how-to/configuration" },
            { text: "Authentication", link: "/how-to/authentication" },
          ],
        },
      ],

      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Commands", link: "/reference/commands" },
            { text: "Configuration", link: "/reference/configuration" },
          ],
        },
      ],

      "/explanation/": [
        {
          text: "Explanation",
          items: [
            { text: "Architecture", link: "/explanation/architecture" },
            { text: "Design Decisions", link: "/explanation/design-decisions" },
          ],
        },
      ],

      "/api/": [
        {
          text: "API Reference",
          items: [{ text: "Overview", link: "/api/" }],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/monte3l/aws-ts" }],

    search: {
      provider: "local",
    },

    editLink: {
      pattern: "https://github.com/monte3l/aws-ts/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },

  markdown: {
    config: (md) => {
      // Enhanced markdown configuration for technical documentation
      md.set({
        breaks: true,
        linkify: true,
      });
    },
  },

  head: [
    ["meta", { name: "theme-color", content: "#646cff" }],
    ["meta", { name: "og:type", content: "website" }],
    ["meta", { name: "og:locale", content: "en" }],
    ["meta", { name: "og:site_name", content: "AWS TypeScript CLI" }],
  ],
});
