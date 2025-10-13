# Branch Strategy – Storyfinder Project

## Overview

This document defines the branch structure and naming conventions for the Storyfinder project. It ensures a clean and collaborative workflow, separating development, experimentation, and production-ready code.

---

## Main Branches

### `main`

- Represents the official, stable version of the project.
- Only contains reviewed and tested code.
- No direct development.
- Changes are merged from the `dev` branch.

### `dev`

- Central branch for integrating all development work.
- New features are merged here before being pushed to `main`.
- No direct individual development – work is done via feature branches.

---

## Feature Branches

Feature branches are used for focused development on specific tasks, components, or by individuals.

**Naming conventions:**
- `feature/[feature-name]`
- `feature/[name]-[topic]`

**Examples:**
- `feature/extension-ui`
- `feature/raphael-nlp`
- `feature/graph-visualization`

> Start each feature branch from `dev` and merge back into `dev` when done.

---

## Sandbox Branches

Sandbox branches are used for experimentation, learning, or prototyping.  
They are not expected to be merged unless useful results emerge.

**Naming conventions:**
- `sandbox/[topic]`
- `sandbox/[name]-test`

**Examples:**
- `sandbox/extension-test`
- `sandbox/api-playground`
- `sandbox/raphael-ideas`

---

## Visualization

```plaintext
          main
            ↑
          (merge)
           dev
          ↙   ↘
  feature/*  sandbox/*
```


