# Demystify React Server Components

I([JSer](https://twitter.com/JSer_ZANP)) wanted to figure out how [React Server Components](https://nextjs.org/docs/advanced-features/react-18/server-components) works internally, so built this demo to have a guess at the implementation.

1.  ⚠️ This is just a demo of the rough ideas, only for learning purpose. It is NOT exactly how RSC actual works!
2.  I will dive into the actual implementation and put what learn on [React Source Code Walkthrough](https://jser.dev/series/react-source-code-walkthrough.html)

# About this demo.

I'll build the React Server Component demo from scratch with a few milestones to see the rationale behinde the idea. It should be easy to follow.

You can:

1. clone the repo and check out at target commit > `npm start` and there you go.
2. or just click the stackblitz link in table below.

| episode                                                     | pr                                                                         | commit                                                                                                                   | blog | stackblitz                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 - Issues of client-side rendering                         | [pr](https://github.com/JSerZANP/demystify-react-server-components/pull/1) | [953cba4](https://github.com/JSerZANP/demystify-react-server-components/commit/953cba437be1458ae8ec7b9665afadf2ac199510) | TODO | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/github-ufmlch?file=README.md) |
| 2 - Manually split component into client part & server part | [pr](https://github.com/JSerZANP/demystify-react-server-components/pull/2) | [f474309](https://github.com/JSerZANP/demystify-react-server-components/commit/f474309a448c81f3eec122bda30d6e8795279f12) | TODO | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/github-7o28y4?file=README.md) |
| 3 - Render Client Components in Server Components           | [pr](https://github.com/JSerZANP/demystify-react-server-components/pull/3) | [d97313d](https://github.com/JSerZANP/demystify-react-server-components/tree/d97313d4b3a93c79d7e7a247e047471e6c5e96a2)   | TODO | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/github-bsmxma?file=README.md) |
| 4 - Automatically build Server Components                   | [pr](https://github.com/JSerZANP/demystify-react-server-components/pull/4) | [4fd1627](https://github.com/JSerZANP/demystify-react-server-components/tree/4fd162781d01594d22f6d74e91d24fd078ca4345)   | TODO | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/github-bsmxma?file=README.md) |
