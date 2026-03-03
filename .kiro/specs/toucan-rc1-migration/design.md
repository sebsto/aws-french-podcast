# Design Document: Toucan RC1 Migration

## Overview

This design document specifies the technical approach for migrating the AWS French Podcast static website from Toucan beta to Toucan RC1 (version 1.0.0-beta.5+). The migration involves transforming the project structure, configuration system, template architecture, and content organization to align with RC1 conventions while preserving all existing functionality and 350+ podcast episodes.

The migration is a one-time, irreversible transformation that must be executed atomically to avoid leaving the project in an inconsistent state. The design prioritizes data preservation, operation ordering, and comprehensive validation to ensure a successful migration.

### Migration Scope

- Directory structure reorganization (themes → templates)
- Configuration file transformation (YAML structure and locations)
- Pipeline and type definition creation (new RC1 features)
- Template variable syntax updates (across all .mustache files)
- Content frontmatter updates (views structure)
- Asset preservation and relocation
- Build process compatibility maintenance

### Key Constraints

- All 350+ episode files must remain intact and accessible
- The webpack build process must continue functioning
- No French or English language content may be modified
- All operations must be logged for troubleshooting
- Rollback capability must be available

## Architecture

### Migration Execution Model

The migration follows a **phased execution model** with strict ordering dependencies:

```
Phase 1: Pre-Migration Validation
    ↓
Phase 2: Directory Structure Migration
    ↓
Phase 3: Configuration File Creation
    ↓
Phase 4: Content Structure Updates
    ↓
Phase 5: Template Variable Transformation
    ↓
Phase 6: Asset Relocation
    ↓
Phase 7: Build Script Updates
    ↓
Phase 8: Post-Migration Validation
    ↓
Phase 9: Migration Report Generation
```

### Operation Ordering Strategy

Critical ordering rules to prevent path conflicts and data loss:

1. **Directory renames before file moves**: Rename `toucan/themes/` to `toucan/templates/` before moving files within
2. **Configuration creation before deletion**: Create new config files before deleting old ones
3. **Content updates before template updates**: Update content frontmatter before transforming template variables
4. **Validation at each phase**: Verify success before proceeding to next phase
5. **Atomic operations**: Use filesystem transactions where possible

## Components and Interfaces

### Migration Script Architecture

```
MigrationOrchestrator
├── ValidationEngine
│   ├── PreMigrationValidator
│   └── PostMigrationValidator
├── DirectoryMigrator
├── ConfigurationGenerator
├── ContentTransformer
├── TemplateTransformer
├── AssetRelocator
└── ReportGenerator
```

### Component Responsibilities

#### MigrationOrchestrator
- Coordinates execution of all migration phases
- Manages phase transitions and error handling
- Maintains migration state and progress
- Triggers rollback via git on critical failures

#### ValidationEngine
- **PreMigrationValidator**: Verifies project structure, file existence, episode count
- **PostMigrationValidator**: Verifies migration completeness, file integrity, syntax validity

#### DirectoryMigrator
- Executes directory renames and moves
- Handles path conflict resolution
- Preserves file permissions and timestamps

#### ConfigurationGenerator
- Creates `toucan.yml` root configuration
- Generates `toucan/config.yml` with RC1 structure
- Transforms `toucan/site.yml` variable structure
- Creates pipeline configurations in `toucan/pipelines/`
- Creates type definitions in `toucan/types/`

#### ContentTransformer
- Updates frontmatter in content files
- Creates special content files (404, RSS, sitemap)
- Preserves episode content integrity

#### TemplateTransformer
- Performs variable syntax transformations
- Creates new template files
- Updates existing templates
- Validates mustache syntax

#### AssetRelocator
- Moves assets from themes to templates directory
- Verifies file integrity after move
- Updates asset references

#### ReportGenerator
- Logs all operations with timestamps
- Records errors and warnings
- Generates summary report
- Creates `migration-log.txt`

### File System Operations

#### Safe File Operations

All file operations use these safety patterns:

```python
# Rename with existence check
def safe_rename(old_path, new_path):
    if not exists(old_path):
        log_error(f"Source does not exist: {old_path}")
        return False
    if exists(new_path):
        log_warning(f"Destination already exists: {new_path}")
        return False
    rename(old_path, new_path)
    log_operation(f"Renamed {old_path} → {new_path}")
    return True

# Move with integrity check
def safe_move(source, destination):
    if not exists(source):
        log_error(f"Source does not exist: {source}")
        return False
    copy(source, destination)
    if verify_integrity(source, destination):
        remove(source)
        log_operation(f"Moved {source} → {destination}")
        return True
    else:
        remove(destination)
        log_error(f"Integrity check failed for {source}")
        return False

# Create with overwrite protection
def safe_create(path, content):
    if exists(path):
        log_warning(f"File already exists: {path}")
        return False
    write_file(path, content)
    log_operation(f"Created {path}")
    return True
```

## Data Models

### Configuration File Structures

#### Root Configuration (toucan.yml)

```yaml
targets:
  dev:
    config: toucan
    input: toucan
  live:
    config: toucan
    input: toucan
    url: https://francais.podcast.go-aws.com/web/
default: dev
```

#### Toucan Configuration (toucan/config.yml)

```yaml
site:
  settings: toucan
  blocks: toucan/blocks
  contents: toucan/contents
  pipelines: toucan/pipelines
  templates:
    location: toucan/templates
    current: aws_podcasts
  types: toucan/types
  date:
    input: "yyyy-MM-dd HH:mm:ss Z"
```

#### Site Variables (toucan/site.yml)

Transformations:
- `title` → `name`
- Remove `dateFormat` key
- All other keys preserved

#### Pipeline Configurations

**HTML Pipeline (toucan/pipelines/html.yml)**

```yaml
contentTypes:
  - page
  - podcast
iterators:
  podcast.pagination:
    limit: 10
    order:
      by: publication
      direction: descending
queries:
  latest:
    contentType: podcast
    limit: 1
    order:
      by: publication
      direction: descending
  podcasts:
    contentType: podcast
    order:
      by: publication
      direction: descending
assets:
  copy: true
```

**RSS Pipeline (toucan/pipelines/rss.yml)**

```yaml
definesType: true
```

**Sitemap Pipeline (toucan/pipelines/sitemap.yml)**

```yaml
queries:
  pages:
    contentType: page
    order:
      by: lastUpdate
      direction: descending
  podcasts:
    contentType: podcast
    order:
      by: lastUpdate
      direction: descending
dates:
  sitemap: "yyyy-MM-dd"
```

**404 Pipeline (toucan/pipelines/404.yml)**

```yaml
# Empty configuration - uses defaults
```

**Redirect Pipeline (toucan/pipelines/redirect.yml)**

```yaml
# Empty configuration - uses defaults
```

#### Type Definitions

**Page Type (toucan/types/page.yml)**

```yaml
id: page
default: true
```

**Podcast Type (toucan/types/podcast.yaml)**

```yaml
id: podcast
paths:
  - episodes
properties:
  title:
    type: string
    required: true
  publication:
    type: date
    required: true
  image:
    type: asset
    required: false
```

**Not Found Type (toucan/types/not-found.yml)**

```yaml
id: not-found
paths:
  - "404"
```

**Redirect Type (toucan/types/redirect.yml)**

```yaml
id: redirect
properties:
  to:
    type: string
    required: true
  code:
    type: int
    required: false
    default: 301
```

### Template Variable Transformations

#### Variable Mapping Table

| Beta Syntax | RC1 Syntax | Context |
|-------------|------------|---------|
| `{{site.baseUrl}}` | `{{baseUrl}}` | All templates |
| `{{site.title}}` | `{{site.name}}` | All templates |
| `{{site.context.latest}}` | `{{context.latest}}` | All templates |
| `{{pagination.data.podcast}}` | `{{iterator.items}}` | Pagination templates |
| `{{& page.contents}}` | `{{& page.contents.html}}` | Page templates |
| `{{medialink}}` | `{{site.medialink}}` | RSS template |
| `{{imagelink}}` | `{{site.imagelink}}` | RSS template |
| `{{rss.artwork}}` | `{{site.rss.artwork}}` | RSS template |
| `{{rss.owner.name}}` | `{{site.rss.owner.name}}` | RSS template |
| `{{rss.owner.email}}` | `{{site.rss.owner.email}}` | RSS template |

#### Transformation Algorithm

```python
def transform_template_variables(file_path):
    content = read_file(file_path)
    
    # Order matters - most specific first
    transformations = [
        (r'\{\{site\.baseUrl\}\}', '{{baseUrl}}'),
        (r'\{\{site\.title\}\}', '{{site.name}}'),
        (r'\{\{site\.context\.latest\}\}', '{{context.latest}}'),
        (r'\{\{pagination\.data\.podcast\}\}', '{{iterator.items}}'),
        (r'\{\{& page\.contents\}\}', '{{& page.contents.html}}'),
        (r'\{\{medialink\}\}', '{{site.medialink}}'),
        (r'\{\{imagelink\}\}', '{{site.imagelink}}'),
        (r'\{\{rss\.artwork\}\}', '{{site.rss.artwork}}'),
        (r'\{\{rss\.owner\.name\}\}', '{{site.rss.owner.name}}'),
        (r'\{\{rss\.owner\.email\}\}', '{{site.rss.owner.email}}'),
    ]
    
    for pattern, replacement in transformations:
        content = re.sub(pattern, replacement, content)
    
    write_file(file_path, content)
    log_operation(f"Transformed variables in {file_path}")
```

### Content Frontmatter Transformations

#### Home Page Transformation

**Before:**
```yaml
---
template: "pages.home"
---
```

**After:**
```yaml
---
views:
    html: "pages.home"
---
```

#### Pagination Page Transformation

**Before:**
```yaml
---
template: "pages.episode_pagination"
---
```

**After:**
```yaml
---
type: page
views:
    html: pages.episode_pagination
slug: episodes/pages/{{podcast.pagination}}
---
```

### New Template Files

#### Template Metadata (toucan/templates/aws_podcasts/template.yml)

```yaml
name: AWS Podcasts
description: Template for AWS French Podcast website
version: 1.0.0-beta.5
generator:
  min: 1.0.0-beta.5
```

#### 404 Template (toucan/templates/aws_podcasts/views/pages/404.mustache)

```mustache
{{<html}}
{{$main}}
{{& page.contents.html}}
{{/main}}
{{/html}}
```

#### Default Page Template (toucan/templates/aws_podcasts/views/pages/default.mustache)

```mustache
{{<html}}
{{$main}}
{{& page.contents.html}}
{{/main}}
{{/html}}
```

#### Redirect Template (toucan/templates/aws_podcasts/views/redirect.mustache)

```mustache
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url={{baseUrl}}/{{page.to}}">
    <link rel="canonical" href="{{baseUrl}}/{{page.to}}">
    <script>window.location.href = "{{baseUrl}}/{{page.to}}";</script>
</head>
<body>
    <p>Redirecting to <a href="{{baseUrl}}/{{page.to}}">{{baseUrl}}/{{page.to}}</a></p>
</body>
</html>
```

#### Sitemap Template (toucan/templates/aws_podcasts/views/sitemap.mustache)

```mustache
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{{#context.pages}}
    <url>
        <loc>{{permalink}}</loc>
        <lastmod>{{lastUpdate}}</lastmod>
    </url>
{{/context.pages}}
{{#context.podcasts}}
    <url>
        <loc>{{permalink}}</loc>
        <lastmod>{{lastUpdate}}</lastmod>
    </url>
{{/context.podcasts}}
</urlset>
```

### Special Content Files

#### 404 Content (toucan/contents/404/index.md)

```markdown
---
type: not-found
title: "404"
description: "Page not found"
---

# Not found

[Return to home](/)
```

#### RSS Content (toucan/contents/rss.xml/index.yml)

```yaml
type: rss
```

#### Sitemap Content (toucan/contents/sitemap.xml/index.yml)

```yaml
type: sitemap
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before defining the correctness properties, I need to analyze the acceptance criteria for testability.


### Property Reflection

After analyzing all acceptance criteria, I've identified several areas of redundancy that can be consolidated:

**File Creation Properties**: Many criteria verify that specific files are created (2.1, 5.1-5.6, 6.1-6.3, 6.7-6.8, 7.1, 7.4-7.5, 10.1, 10.3, 10.5, 10.7, 10.9). These can be consolidated into a single property that verifies all required files exist after migration.

**Configuration Content Properties**: Many criteria verify specific YAML content in configuration files (2.2-2.5, 3.2-3.9, 5.7-5.14, 6.2-6.10). These can be consolidated into properties that verify the complete structure of each configuration file rather than individual fields.

**Template Variable Transformation Properties**: Criteria 9.1-9.8 all verify specific variable replacements. These can be consolidated into a single property that verifies no old-style variables remain in any mustache file.

**File Deletion Properties**: Criteria 3.10, 6.11, 17.1-17.3 verify that old files are removed. These can be consolidated into a single property verifying cleanup completeness.

**Data Preservation Properties**: Criteria 1.7, 14.1-14.4, 15.2, 19.1-19.3, 19.5-19.6 all verify data preservation. These can be consolidated into properties about episode preservation and content preservation.

**File Integrity Properties**: Criteria 15.3-15.6 verify file integrity after move. These can be consolidated into a single property about asset integrity.

**Log Properties**: Criteria 20.1-20.6 all verify logging behavior. These can be consolidated into properties about log completeness and format.

After consolidation, we focus on high-value properties that provide unique validation:

1. **Directory Structure Transformation**: Verifies all directory renames completed correctly
2. **File Creation Completeness**: Verifies all new RC1 files exist
3. **Configuration Structure Validity**: Verifies all config files have correct RC1 structure
4. **Template Variable Migration**: Verifies no beta-style variables remain
5. **Episode Data Preservation**: Verifies all episodes intact
6. **Asset Integrity**: Verifies assets moved without corruption
7. **Old File Cleanup**: Verifies beta files removed
8. **Migration Logging**: Verifies complete operation log

### Property 1: Directory Structure Transformation Completeness

*For any* migration execution, after completion, the directory structure should match RC1 conventions: `toucan/templates/` exists (not `toucan/themes/`), `toucan/templates/aws_podcasts/views/` exists (not `toucan/themes/aws_podcasts/templates/`), `toucan/contents/[home]/` exists (not `toucan/contents/home/`), and `toucan/contents/episodes/{{podcast.pagination}}/` exists (not `toucan/contents/episodes/pagination/`).

**Validates: Requirements 1.1, 1.4, 1.5, 1.6**

### Property 2: Configuration File Creation and Structure

*For any* migration execution, after completion, all required configuration files should exist with valid RC1 structure: `toucan.yml` at project root with dev and live targets, `toucan/config.yml` with site paths configuration, `toucan/site.yml` with `name` key (not `title`) and no `dateFormat` key, all pipeline files in `toucan/pipelines/`, and all type definition files in `toucan/types/`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.7, 6.8, 17.4, 17.5, 17.6, 17.7, 17.8**

### Property 3: Pipeline Configuration Correctness

*For any* migration execution, the HTML pipeline should define content types ["page", "podcast"], iterator "podcast.pagination" with limit 10, queries "latest" and "podcasts", and assets.copy=true; the RSS pipeline should have definesType=true; and the sitemap pipeline should define queries for pages and podcasts with date format "sitemap: yyyy-MM-dd".

**Validates: Requirements 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14**

### Property 4: Type Definition Correctness

*For any* migration execution, the podcast type should define id="podcast", paths=["episodes"], and required properties (title: string, publication: date) plus optional property (image: asset); the redirect type should define required property "to" (string) and optional property "code" (int, default 301); page type should have id="page" and default=true; not-found type should have id="not-found" and paths=["404"].

**Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10**

### Property 5: Template Variable Transformation Completeness

*For any* migration execution, after completion, no mustache files should contain beta-style variable syntax: no `{{site.baseUrl}}` (should be `{{baseUrl}}`), no `{{site.title}}` (should be `{{site.name}}`), no `{{site.context.latest}}` (should be `{{context.latest}}`), no `{{pagination.data.podcast}}` (should be `{{iterator.items}}`), no `{{& page.contents}}` without `.html` (should be `{{& page.contents.html}}`), and no bare `{{medialink}}` or `{{imagelink}}` (should be `{{site.medialink}}` and `{{site.imagelink}}`).

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 16.2, 16.3, 16.4, 16.5, 17.9**

### Property 6: New Template File Creation

*For any* migration execution, after completion, all new RC1 template files should exist: `toucan/templates/aws_podcasts/template.yml` with version "1.0.0-beta.5", `toucan/templates/aws_podcasts/views/pages/404.mustache`, `toucan/templates/aws_podcasts/views/pages/default.mustache`, `toucan/templates/aws_podcasts/views/redirect.mustache`, and `toucan/templates/aws_podcasts/views/sitemap.mustache`.

**Validates: Requirements 10.1, 10.2, 10.3, 10.5, 10.7, 10.9**

### Property 7: Special Content File Creation

*For any* migration execution, after completion, special content files should exist: `toucan/contents/404/index.md` with type "not-found" and markdown content, `toucan/contents/rss.xml/index.yml` with type "rss", and `toucan/contents/sitemap.xml/index.yml` with type "sitemap".

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 8: Content Frontmatter Transformation

*For any* migration execution, after completion, `toucan/contents/[home]/index.md` should use `views: {html: "pages.home"}` structure (not `template`), and `toucan/contents/episodes/{{podcast.pagination}}/index.md` should have type "page", views structure, and slug "episodes/pages/{{podcast.pagination}}".

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 9: Episode Data Preservation

*For any* migration execution, the episode count before and after migration should be identical, all episode directories (001-350) should exist in `toucan/contents/episodes/`, and all episode `index.md` files should retain their original frontmatter and content unchanged.

**Validates: Requirements 1.7, 14.1, 14.2, 14.3, 14.4**

### Property 10: Asset Relocation and Integrity

*For any* migration execution, after completion, all assets should exist in `toucan/templates/aws_podcasts/assets/` (not `toucan/themes/aws_podcasts/assets/`), and all CSS, JavaScript, image, and font files should be valid and uncorrupted (verifiable by parsing/size check).

**Validates: Requirements 15.1, 15.3, 15.4, 15.5, 15.6**

### Property 11: Beta File Cleanup

*For any* migration execution, after completion, no beta-era files should remain: `toucan/themes/` directory should not exist, `toucan/config.yaml` should not exist, and `toucan/contents/index.yaml` should not exist.

**Validates: Requirements 3.10, 6.11, 17.1, 17.2, 17.3**

### Property 12: Build Script Path Updates

*For any* migration execution, the "copy" script in `package.json` should reference `toucan/templates/aws_podcasts/` (not `toucan/themes/aws_podcasts/`) for all copy operations (css, fonts, images, js, index.html).

**Validates: Requirements 12.1, 12.2, 12.3**

### Property 13: JavaScript Null Safety Updates

*For any* migration execution, `toucan/templates/aws_podcasts/assets/js/navigation.js` should include null checks before `document.getElementById('episodes_cards')` and `document.querySelector('#scrollAnchor')` operations.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 14: Language Content Preservation

*For any* migration execution, all French language text in `toucan/site.yml` and all content files should remain unchanged, and the `language` field should be preserved.

**Validates: Requirements 4.3, 4.5, 19.1, 19.2, 19.3, 19.5, 19.6**

### Property 15: Build Configuration Preservation

*For any* migration execution, `webpack.config.js` and `postcss.config.js` should remain unchanged, and `package.json` dependencies should remain unchanged (only the "copy" script should be modified).

**Validates: Requirements 18.1, 18.2, 18.3**

### Property 16: YAML Validity Preservation

*For any* migration execution, all YAML files created or modified should be valid YAML (parseable without errors).

**Validates: Requirements 2.5, 4.4**

### Property 17: Mustache Syntax Validity

*For any* migration execution, all mustache files should have valid syntax after transformation (parseable without errors).

**Validates: Requirements 9.9**

### Property 18: Migration Log Completeness

*For any* migration execution, a migration log file `migration-log.txt` should be created at project root containing timestamped records of all file operations (moved, renamed, created, deleted), template transformations, and any errors or warnings.

**Validates: Requirements 17.10, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6**

## Error Handling

### Error Categories

The migration system handles four categories of errors:

1. **Pre-Migration Validation Errors**: Project structure issues detected before migration starts
2. **File Operation Errors**: Failures during file system operations
3. **Transformation Errors**: Failures during content or template transformation
4. **Post-Migration Validation Errors**: Issues detected after migration completes

### Error Handling Strategy

#### Pre-Migration Validation Errors

These errors prevent migration from starting:

- **Missing Required Files**: `toucan/config.yaml`, `toucan/contents/index.yaml`, or theme directory missing
- **Incorrect Episode Count**: Episode count doesn't match expected range
- **Existing RC1 Structure**: Target directories already exist (indicates previous migration)

**Handling**: Log error, display clear message, exit without making changes.

#### File Operation Errors

These errors occur during migration execution:

- **Permission Denied**: Insufficient permissions to rename/move/create files
- **Disk Space**: Insufficient disk space for backup or new files
- **Path Conflicts**: Target path already exists unexpectedly
- **File Locked**: File in use by another process

**Handling**: Log error with context, attempt rollback to pre-migration state, exit with error code.

#### Transformation Errors

These errors occur during content processing:

- **Invalid YAML**: Malformed YAML in source files
- **Invalid Mustache**: Malformed mustache syntax
- **Missing Expected Content**: Expected frontmatter or content not found
- **Encoding Issues**: Non-UTF-8 characters causing parsing failures

**Handling**: Log error with file path and line number, attempt to continue with other files, report all errors at end.

#### Post-Migration Validation Errors

These errors indicate migration completed but validation failed:

- **Missing Required Files**: Expected RC1 files not created
- **Episode Count Mismatch**: Episodes lost during migration
- **Invalid Syntax**: Generated files have syntax errors
- **Old Patterns Remaining**: Beta-style variables still present

**Handling**: Log all validation failures, recommend rollback, provide detailed report for troubleshooting.

### Error Recovery

When critical errors occur:
1. Stop all migration operations immediately
2. Log detailed error information
3. Display clear error message to user
4. Recommend: `git reset --hard HEAD` to revert all changes
5. Exit with appropriate error code

For non-critical errors:
1. Complete migration with warnings
2. Generate detailed error report
3. Provide manual fix instructions
4. Use git to revert if needed (migration runs on separate branch)

### Logging Strategy

All errors logged with:
- **Timestamp**: ISO 8601 format
- **Severity**: ERROR, WARNING, INFO
- **Phase**: Which migration phase encountered the error
- **Context**: File path, operation type, expected vs actual state
- **Stack Trace**: For unexpected errors

Example log entry:
```
2025-01-15T10:23:45Z [ERROR] Phase 3: Directory Migration
  Operation: Rename toucan/themes/ → toucan/templates/
  Error: Permission denied
  Context: User lacks write permission on toucan/ directory
```

## Testing Strategy

### Dual Testing Approach

The migration system requires both unit tests and property-based tests for comprehensive validation:

**Unit Tests**: Verify specific examples, edge cases, and error conditions
- Test migration of minimal project structure
- Test handling of missing files
- Test handling of malformed YAML
- Test rollback on specific error conditions
- Test log file generation

**Property Tests**: Verify universal properties across all inputs
- Test with varying episode counts (1, 10, 100, 350, 1000)
- Test with different site configurations (French, English, custom)
- Test with various template structures
- Test idempotency (running migration twice)
- Test with different file permissions

### Property-Based Testing Configuration

**Testing Library**: Use `hypothesis` (Python), `fast-check` (JavaScript/TypeScript), or `QuickCheck` (Haskell) depending on implementation language.

**Test Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with: **Feature: toucan-rc1-migration, Property {number}: {property_text}**

**Generator Strategy**:

For testing migration properties, we need generators for:

1. **Project Structure Generator**: Creates valid Toucan beta project structures with varying:
   - Episode counts (1-1000)
   - Site configuration variations
   - Template variations
   - Content variations

2. **Episode Generator**: Creates valid episode frontmatter with:
   - Random titles, descriptions, dates
   - Random guest lists (0-5 guests)
   - Random link lists (0-10 links)
   - Valid episode numbers

3. **Configuration Generator**: Creates valid beta configuration with:
   - Different theme names
   - Different date formats
   - Different site variables

### Unit Test Coverage

Unit tests should cover:

1. **Happy Path**: Migration of standard project succeeds
2. **Edge Cases**:
   - Empty episode list
   - Single episode
   - Maximum episode count (1000+)
   - Special characters in content
   - Non-ASCII characters in French content
3. **Error Cases**:
   - Missing source files
   - Permission denied
   - Disk space exhausted
   - Malformed YAML
   - Invalid mustache syntax
4. **Idempotency**: Running migration twice produces same result
5. **Rollback**: Rollback restores original state

### Integration Testing

Integration tests verify:

1. **End-to-End Migration**: Complete migration of real project structure
2. **Toucan RC1 Compatibility**: Generated structure works with Toucan RC1
3. **Build Process**: Webpack build still works after migration
4. **Site Generation**: Toucan can generate site from migrated structure

### Test Data

Test data includes:

1. **Minimal Project**: Bare minimum Toucan beta structure
2. **Standard Project**: Typical project with 10 episodes
3. **Full Project**: Complete project with 350+ episodes (copy of real project)
4. **Edge Case Projects**: Projects with unusual configurations

### Validation Testing

Validation tests verify:

1. **YAML Validity**: All generated YAML files parse correctly
2. **Mustache Validity**: All generated mustache files parse correctly
3. **File Integrity**: All moved files have correct checksums
4. **Content Preservation**: All episode content unchanged
5. **Structure Completeness**: All required RC1 files exist

### Performance Testing

Performance tests measure:

1. **Migration Time**: Time to migrate projects of varying sizes
2. **Memory Usage**: Peak memory during migration
3. **Disk I/O**: Number of file operations
4. **Backup Size**: Size of backup directory

Target performance:
- 350 episodes: < 5 seconds
- 1000 episodes: < 15 seconds
- Memory: < 500MB peak
- Backup: ~1x project size

## Implementation Notes

### Technology Choices

**Implementation Language**: Python 3.9+ recommended for:
- Excellent file system operations
- Strong YAML parsing (PyYAML)
- Good regex support
- Easy CLI creation (argparse/click)
- Cross-platform compatibility

**Alternative**: Node.js/TypeScript for:
- Consistency with webpack build process
- Native mustache parsing
- Good YAML support (js-yaml)

### Dependencies

Required libraries:
- **YAML Parser**: PyYAML (Python) or js-yaml (Node.js)
- **Mustache Parser**: pystache (Python) or mustache.js (Node.js)
- **File Operations**: pathlib (Python) or fs-extra (Node.js)
- **Logging**: logging (Python) or winston (Node.js)
- **Testing**: pytest + hypothesis (Python) or jest + fast-check (Node.js)

### Execution Model

**CLI Interface**:
```bash
# Basic migration
python migrate.py

# Dry run (validation only)
python migrate.py --dry-run

# Verbose logging
python migrate.py --verbose
```

**Exit Codes**:
- 0: Success
- 1: Pre-migration validation failed
- 2: Migration failed (git revert recommended)
- 3: Post-migration validation failed

### Idempotency Design

Since the migration runs on a separate git branch, idempotency is not required. If the migration fails:
- Use git to revert changes: `git reset --hard HEAD`
- Fix the issue
- Re-run the migration script on a clean branch

This simplifies the implementation by removing the need for:
- Existence checks before creating files
- Content comparison before transforming
- Skip logic for completed operations

### Backup Strategy

Since the migration runs on a separate git branch, no separate backup is needed:

**Git-based backup**:
- Create migration branch before running: `git checkout -b toucan-rc1-migration`
- Commit current state: `git commit -am "Pre-migration snapshot"`
- Run migration
- If issues occur: `git reset --hard HEAD` to revert

**Benefits**:
- No disk space overhead
- Instant rollback
- Full version history
- Easy to compare changes with `git diff`

### Migration Phases Detail

#### Phase 1: Pre-Migration Validation (5-10 seconds)

Validates:
- Required files exist
- Episode count in expected range
- No RC1 structure already present
- Sufficient disk space
- Write permissions

#### Phase 2: Backup Creation (10-30 seconds for 350 episodes)

Creates:
- Timestamped backup directory
- Complete copy of toucan/ directory
- Copies of build configuration files

#### Phase 3: Directory Structure Migration (1-2 seconds)

Executes:
- Rename toucan/themes/ → toucan/templates/
- Rename toucan/contents/home/ → toucan/contents/[home]/
- Rename toucan/contents/episodes/pagination/ → toucan/contents/episodes/{{podcast.pagination}}/
- Rename toucan/templates/aws_podcasts/templates/ → toucan/templates/aws_podcasts/views/

#### Phase 4: Configuration File Creation (1 second)

Creates:
- toucan.yml
- toucan/config.yml
- toucan/site.yml (transformed)
- toucan/pipelines/*.yml (5 files)
- toucan/types/*.yml (4 files)

#### Phase 5: Content Structure Updates (1-2 seconds)

Creates:
- toucan/contents/404/index.md
- toucan/contents/rss.xml/index.yml
- toucan/contents/sitemap.xml/index.yml

Updates:
- toucan/contents/[home]/index.md frontmatter
- toucan/contents/episodes/{{podcast.pagination}}/index.md frontmatter

#### Phase 6: Template Variable Transformation (2-5 seconds)

Transforms all .mustache files:
- Find and replace variable patterns
- Validate mustache syntax
- Log all transformations

#### Phase 7: Asset Relocation (5-10 seconds)

Moves:
- CSS files
- JavaScript files
- Image files
- Font files
- Other assets

Validates integrity after each move.

#### Phase 8: Build Script Updates (< 1 second)

Updates:
- package.json copy script

#### Phase 9: Post-Migration Validation (5-10 seconds)

Validates:
- All required files exist
- All old files removed
- Episode count preserved
- YAML validity
- Mustache validity
- Asset integrity

#### Phase 10: Migration Report Generation (< 1 second)

Generates:
- migration-log.txt with all operations
- Summary statistics
- Error/warning report

**Total Estimated Time**: 30-60 seconds for 350 episodes

### Rollback Procedure

Since the migration runs on a separate git branch, rollback is simple:

```bash
# Revert all changes
git reset --hard HEAD

# Or if you've committed
git reset --hard HEAD~1
```

This instantly reverts all migration changes without needing backup files.

### Post-Migration Steps

After successful migration:

1. **Test Build Process**:
   ```bash
   npm run build
   npm run copy
   ```

2. **Test Site Generation**:
   ```bash
   toucan generate ./toucan ./dist --base-url https://francais.podcast.go-aws.com/web
   ```

3. **Verify Output**:
   - Check dist/ directory structure
   - Verify episode pages generated
   - Verify RSS feed valid
   - Verify sitemap valid

4. **Deploy Test**:
   - Deploy to preview environment
   - Test navigation
   - Test audio playback
   - Test RSS feed in podcast app

5. **Cleanup**:
   - Remove backup directory (after confirming success)
   - Commit changes to version control

### Troubleshooting Guide

**Issue**: Migration fails with "Permission denied"
**Solution**: Run with appropriate permissions or change file ownership

**Issue**: Episode count mismatch after migration
**Solution**: Check migration log for errors, restore from backup, investigate

**Issue**: Toucan RC1 fails to generate site
**Solution**: Verify all configuration files have correct structure, check Toucan RC1 error messages

**Issue**: Webpack build fails after migration
**Solution**: Verify package.json copy script updated correctly, check paths

**Issue**: RSS feed invalid after migration
**Solution**: Verify RSS template variable transformations, check site.yml structure

**Issue**: Migration hangs during execution
**Solution**: Check for file locks, verify disk space, check system resources

### Migration Checklist

Pre-migration:
- [ ] Backup project manually (in addition to automatic backup)
- [ ] Commit all changes to version control
- [ ] Verify episode count (should be 350+)
- [ ] Verify disk space available (need 2x project size)
- [ ] Close any editors with project files open

Post-migration:
- [ ] Review migration log for errors/warnings
- [ ] Verify episode count unchanged
- [ ] Test webpack build process
- [ ] Test Toucan RC1 site generation
- [ ] Verify RSS feed valid
- [ ] Verify sitemap valid
- [ ] Test site in browser
- [ ] Deploy to preview environment
- [ ] Test in production-like environment
- [ ] Commit migrated structure to version control
- [ ] Remove backup directory

## Conclusion

This design provides a comprehensive, safe, and validated approach to migrating the AWS French Podcast website from Toucan beta to Toucan RC1. The phased execution model with strict ordering, comprehensive validation, and rollback capability ensures data preservation while transforming the project structure to RC1 conventions.

The migration is designed to be:
- **Safe**: Automatic backup and rollback on errors
- **Validated**: Pre and post-migration validation with 18 correctness properties
- **Logged**: Complete operation log for troubleshooting
- **Tested**: Comprehensive unit and property-based test coverage
- **Git-friendly**: Runs on separate branch for easy revert if needed

Implementation should follow the component architecture, use the specified data models, and adhere to the error handling and testing strategies outlined in this document.
