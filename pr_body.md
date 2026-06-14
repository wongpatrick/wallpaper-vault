## Summary
This PR improves the user experience around editing functionality and fixes a minor TypeScript error in the images API.

## Details
- **Image Lightbox**: Updated the ambiguous "Edit" button to say "Edit Metadata".
- **Taxonomy Management**: Added descriptive tooltips ("Edit Character", "Edit Franchise", "Edit Tag") to the edit action icons.
- **Images API**: Fixed a typo where `colorTolerance` was incorrectly passed instead of `color_tolerance` in `ReadImagesApiImagesGetParams`.

## Motivation
- To provide more clarity on what the "Edit" buttons actually do, reducing user ambiguity.
- To resolve a TypeScript compilation error that broke the frontend build.
