# Demystify React Server Components

I([JSer](https://twitter.com/JSer_ZANP)) wanted to figure out how [React Server Components](https://nextjs.org/docs/advanced-features/react-18/server-components) works internally, so built this demo to have a guess at the implementation.

1.  ⚠️ This is just a demo of the rough ideas, only for learning purpose. It is NOT exactly how RSC actual works!
2.  I will dive into the actual implementation and put what learn on [React Source Code Walkthrough](https://jser.dev/series/react-source-code-walkthrough.html)

# About this demo.

I'll build the React Server Component demo from scratch with a few milestones to see the rationale behinde the idea. It should be easy to follow.

You can:

1. clone the repo and check out at target commit > `npm start` and there you go.
2. or just click the stackblitz link in table below.

| episode                             | pr                                                                         | commit                                                                                                                   | blog | stackblitz                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 - Issues of client-side rendering | [pr](https://github.com/JSerZANP/demystify-react-server-components/pull/1) | [953cba4](https://github.com/JSerZANP/demystify-react-server-components/commit/953cba437be1458ae8ec7b9665afadf2ac199510) | TODO | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/github-ufmlch?file=README.md) |
