# 3D Enhancement Specification

## Purpose

This document defines the target state for the vtk.js 3D view in the current implementation. The goal is to evolve the existing dashboard-style 3D pipe render so it more closely matches the supplied engineering reference image.

## Current Implementation Summary

The current 3D scene already renders in the C-Scan master controller and includes:

- A dark-theme 3D viewport
- A closed cylindrical pipe form
- A localized defect hotspot rendered as a glow/blob on the pipe
- Custom lighting and camera setup
- Existing scalar/color helper logic

## Target Reference Summary

The target reference reads as an engineering or FEA-style visualization with these characteristics:

- An open cutaway pipe section rather than a closed cylinder
- Visible wall thickness with inner and outer surfaces
- Exposed cut faces
- Surface mesh visibility
- Smooth stress-style contour mapping across the defect region
- Scalar legend/color bar
- Axis triad / orientation marker
- Neutral analysis-style presentation rather than dashboard styling

## Reference Asset

The supplied reference image has been saved locally in the project at:

- `G:\005 Current projects\ClientVersion\reference_3d_target.png`

## Problem Statement

The current 3D output does not yet match the reference in geometry, deformation style, scalar presentation, or analysis context. The current scene looks like a product/dashboard visualization, while the target is an engineering post-processing view.

## Objectives

1. Preserve the existing application flow and 3D integration.
2. Improve the 3D scene so it visually aligns with the engineering reference.
3. Keep changes surgical and isolated to relevant 3D rendering paths.
4. Reuse existing helpers and scene infrastructure where practical.
5. Introduce a dedicated reference / FEA-style render path if needed to avoid breaking the current dashboard view.

## Functional Requirements

### 1. Geometry

- Replace the closed cylinder-style pipe with a cutaway pipe section.
- Add visible wall thickness by modeling:
  - outer wall
  - inner wall
  - open cut faces
- Remove or disable closed-end presentation where it conflicts with the reference look.
- Ensure the final silhouette resembles the supplied open C-shaped pipe section.

### 2. Defect Representation

- Replace the current localized glow/blob style with a surface-based engineering contour field.
- The defect must appear embedded in the pipe wall, not like a separate spherical or volumetric object.
- Use smooth deformation and/or scalar variation so the defect reads as a local stress/thinning/deformation zone.
- Ensure the affected area transitions smoothly into the surrounding surface.

### 3. Scalar Mapping

- Use a continuous scalar contour map across the defect region and nearby surface.
- Avoid brand-style or decorative defect tinting if it reduces fidelity to the engineering reference.
- Tune the colormap toward an engineering stress/post-processing look.
- Support a defined scalar range that can feed a legend/color bar.

### 4. Mesh Appearance

- Increase surface resolution enough to avoid coarse faceting.
- Render visible mesh lines over the geometry to resemble an analysis mesh.
- Mesh visibility should be subtle but clearly readable.

### 5. Legend and Orientation

- Add a scalar legend/color bar with:
  - title
  - gradient ramp
  - tick values
- Add an axis triad or equivalent orientation marker in a corner of the view.

### 6. Camera and Composition

- Update camera angle, zoom, and framing to match the reference perspective as closely as practical.
- Focus the composition on the defect region and cutaway geometry.
- Reduce presentation choices that make the model look decorative instead of analytical.

### 7. Lighting and Background

- Retune shading and lighting to resemble engineering analysis output.
- Reduce glossy or dramatic dashboard-style rendering.
- Add or support a neutral/light background mode if needed for reference fidelity.
- Remove non-reference scene elements such as a ground grid when they hurt comparison quality.

## Non-Functional Requirements

- Preserve existing UI behavior and control wiring.
- Do not rewrite unrelated 2D panels or general dashboard logic.
- Keep the implementation maintainable and easy to tune.
- Prefer extending existing scene-building logic over duplicating unrelated code paths.

## Suggested Implementation Areas

Inspect and update these files first:

- `main.js`
- `vtk-shared.js`
- `client_software_interface_vtk.html`

## Recommended Implementation Strategy

1. Review the current `buildPipeScene()` path and identify what can be reused.
2. Refactor the 3D scene builder to support a reference-style geometry mode.
3. Build cutaway geometry with inner wall, outer wall, and open faces.
4. Replace the current defect hotspot treatment with surface scalar/deformation logic.
5. Add legend and orientation marker support.
6. Retune camera, lighting, and background for engineering-style presentation.
7. Validate the result visually against the supplied reference.

## Acceptance Criteria

The work is complete when:

- The 3D scene no longer reads as a closed cylinder dashboard render.
- The pipe clearly shows cutaway geometry and wall thickness.
- The defect appears as a smooth analysis-style field on the pipe wall.
- A scalar legend/color bar is visible and meaningful.
- An axis triad/orientation marker is present.
- Camera angle and overall composition are recognizably closer to the reference.
- Decorative elements that conflict with the reference have been removed or disabled.
- Existing application behavior remains intact outside the intended 3D enhancement scope.

## Deliverable Expectation

Produce an updated vtk.js 3D rendering path that aligns much more closely with the supplied engineering reference, while remaining compatible with the existing application structure.
