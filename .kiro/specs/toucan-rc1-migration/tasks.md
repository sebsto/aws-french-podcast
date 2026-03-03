# Implementation Plan: Toucan RC1 Migration

## Overview

This implementation plan covers the migration of the AWS French Podcast static website from Toucan beta to Toucan RC1. The migration involves a 10-phase approach with comprehensive validation, backup/rollback capabilities, and transformation of directory structure, configuration files, templates, and content while preserving all 350+ podcast episodes.

The implementation uses Python 3.9+ for excellent file system operations, YAML parsing, and cross-platform compatibility.

## Tasks

- [ ] 1. Set up migration script structure and dependencies
  - Create `scripts/migrate-to-rc1.py` as main entry point
  - Set up Python virtual environment and install dependencies (PyYAML, pystache)
  - Create component modules: `validation.py`, `backup.py`, `directory.py`, `config.py`, `content.py`, `template.py`, `assets.py`, `logger.py`
  - Implement CLI interface with argparse (--dry-run, --verbose, --no-backup, --backup-dir flags)
  - Define exit codes (0=success, 1=pre-validation failed, 2=migration failed, 3=post-validation failed, 4=rollback failed)
  - _Requirements: All requirements (foundation for entire migration)_

- [ ] 2. Implement logging system
  - [ ] 2.1 Create MigrationLogger class in `logger.py`
    - Implement timestamped logging with severity levels (ERROR, WARNING, INFO)
    - Add phase tracking to log entries
    - Include context information (file paths, operations, expected vs actual state)
    - Write logs to both console and `migration-log.txt` file
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

  - [ ]* 2.2 Write unit tests for logging system
    - Test log file creation and format
    - Test different severity levels
    - Test phase tracking
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

- [ ] 3. Implement pre-migration validation
  - [ ] 3.1 Create PreMigrationValidator class in `validation.py`
    - Check required files exist (`toucan/config.yaml`, `toucan/contents/index.yaml`, `toucan/themes/`)
    - Verify episode count in expected range (count directories in `toucan/contents/episodes/`)
    - Check no RC1 structure already present (`toucan/templates/` should not exist)
    - Verify sufficient disk space (need 2x project size for backup)
    - Verify write permissions on toucan/ directory
    - _Requirements: 1.7, 14.1, 14.2, 14.3, 14.4, 17.1, 17.2, 17.3_

  - [ ]* 3.2 Write property test for pre-migration validation
    - **Property 9: Episode Data Preservation (pre-check)**
    - **Validates: Requirements 1.7, 14.1, 14.2, 14.3, 14.4**
    - Generate projects with varying episode counts (1, 10, 100, 350, 1000)
    - Verify validator correctly counts episodes
    - _Requirements: 1.7, 14.1, 14.2, 14.3, 14.4_

- [ ] 4. Implement directory migration
  - [ ] 4.1 Create DirectoryMigrator class in `directory.py`
    - Implement safe_rename() with existence checks and conflict handling
    - Rename `toucan/themes/` → `toucan/templates/`
    - Rename `toucan/contents/home/` → `toucan/contents/[home]/`
    - Rename `toucan/contents/episodes/pagination/` → `toucan/contents/episodes/{{podcast.pagination}}/`
    - Rename `toucan/templates/aws_podcasts/templates/` → `toucan/templates/aws_podcasts/views/`
    - Preserve file permissions and timestamps
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

  - [ ]* 4.2 Write property test for directory migration
    - **Property 1: Directory Structure Transformation Completeness**
    - **Validates: Requirements 1.1, 1.4, 1.5, 1.6**
    - Verify all directory renames completed correctly
    - Test with different project structures
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

- [ ] 6. Checkpoint - Verify directory migration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement configuration file generation
  - [ ] 7.1 Create ConfigurationGenerator class in `config.py`
    - Generate `toucan.yml` at project root with dev/live targets
    - Generate `toucan/config.yml` with RC1 structure (site paths, templates, types, pipelines)
    - Transform `toucan/site.yml` (rename `title` → `name`, remove `dateFormat`, preserve other keys)
    - Move `toucan/contents/index.yaml` → `toucan/site.yml` during transformation
    - Rename `toucan/config.yaml` → `toucan/config.yml` with new structure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 7.2 Write property test for configuration generation
    - **Property 2: Configuration File Creation and Structure**
    - **Validates: Requirements 2.1-2.4, 3.1-3.9, 4.1-4.5, 17.4-17.8**
    - Verify all config files exist with valid RC1 structure
    - Test with different site configurations (French, English, custom)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 7.3 Write property test for YAML validity
    - **Property 16: YAML Validity Preservation**
    - **Validates: Requirements 2.5, 4.4**
    - Verify all generated YAML files are parseable
    - _Requirements: 2.5, 4.4_

- [ ] 8. Implement pipeline configuration generation
  - [ ] 8.1 Create pipeline file generators in `config.py`
    - Create `toucan/pipelines/` directory
    - Generate `html.yml` with content types, iterators, queries, assets config
    - Generate `rss.yml` with definesType=true
    - Generate `sitemap.yml` with queries and date format
    - Generate `404.yml` (empty config)
    - Generate `redirect.yml` (empty config)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14_

  - [ ]* 8.2 Write property test for pipeline configuration
    - **Property 3: Pipeline Configuration Correctness**
    - **Validates: Requirements 5.7-5.14**
    - Verify HTML pipeline has correct content types, iterators, queries
    - Verify RSS and sitemap pipelines have correct structure
    - _Requirements: 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14_

- [ ] 9. Implement type definition generation
  - [ ] 9.1 Create type definition generators in `config.py`
    - Create `toucan/types/` directory
    - Generate `page.yml` with id="page" and default=true
    - Generate `podcast.yaml` with id, paths, and properties (title, publication, image)
    - Generate `not-found.yml` with id and paths
    - Generate `redirect.yml` with id and properties (to, code)
    - Delete old `toucan/themes/aws_podcasts/types/podcast.yaml`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [ ]* 9.2 Write property test for type definitions
    - **Property 4: Type Definition Correctness**
    - **Validates: Requirements 6.2-6.10**
    - Verify all type definitions have correct structure and properties
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [ ] 10. Checkpoint - Verify configuration generation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement special content file creation
  - [ ] 11.1 Create ContentTransformer class in `content.py`
    - Create `toucan/contents/404/` directory and `index.md` with type="not-found", title, description, markdown content
    - Create `toucan/contents/rss.xml/` directory and `index.yml` with type="rss"
    - Create `toucan/contents/sitemap.xml/` directory and `index.yml` with type="sitemap"
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 11.2 Write property test for special content creation
    - **Property 7: Special Content File Creation**
    - **Validates: Requirements 7.1-7.5**
    - Verify all special content files exist with correct structure
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 12. Implement content frontmatter transformation
  - [ ] 12.1 Add frontmatter transformation methods to ContentTransformer
    - Update `toucan/contents/[home]/index.md` to use `views: {html: "pages.home"}` instead of `template`
    - Update `toucan/contents/episodes/{{podcast.pagination}}/index.md` with type="page", views structure, and slug
    - Preserve all other frontmatter fields
    - Use YAML parser to safely modify frontmatter
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 12.2 Write property test for frontmatter transformation
    - **Property 8: Content Frontmatter Transformation**
    - **Validates: Requirements 8.1-8.4**
    - Verify frontmatter uses RC1 views structure
    - Verify other fields preserved
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 13. Implement template variable transformation
  - [ ] 13.1 Create TemplateTransformer class in `template.py`
    - Find all .mustache files in `toucan/templates/aws_podcasts/`
    - Apply variable transformations using regex (ordered from most specific to least):
      - `{{site.baseUrl}}` → `{{baseUrl}}`
      - `{{site.title}}` → `{{site.name}}`
      - `{{site.context.latest}}` → `{{context.latest}}`
      - `{{pagination.data.podcast}}` → `{{iterator.items}}`
      - `{{& page.contents}}` → `{{& page.contents.html}}`
      - `{{medialink}}` → `{{site.medialink}}`
      - `{{imagelink}}` → `{{site.imagelink}}`
      - `{{rss.artwork}}` → `{{site.rss.artwork}}`
      - `{{rss.owner.name}}` → `{{site.rss.owner.name}}`
      - `{{rss.owner.email}}` → `{{site.rss.owner.email}}`
    - Validate mustache syntax after transformation
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 16.2, 16.3, 16.4, 16.5_

  - [ ]* 13.2 Write property test for template variable transformation
    - **Property 5: Template Variable Transformation Completeness**
    - **Validates: Requirements 9.1-9.8, 16.2-16.5, 17.9**
    - Verify no beta-style variables remain in any mustache file
    - Test with various template structures
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 16.2, 16.3, 16.4, 16.5_

  - [ ]* 13.3 Write property test for mustache syntax validity
    - **Property 17: Mustache Syntax Validity**
    - **Validates: Requirements 9.9**
    - Verify all mustache files have valid syntax after transformation
    - _Requirements: 9.9_

- [ ] 14. Implement new template file creation
  - [ ] 14.1 Add template creation methods to TemplateTransformer
    - Create `toucan/templates/aws_podcasts/template.yml` with metadata (name, description, version "1.0.0-beta.5", generator versions)
    - Create `toucan/templates/aws_podcasts/views/pages/404.mustache` extending html layout
    - Create `toucan/templates/aws_podcasts/views/pages/default.mustache` extending html layout
    - Create `toucan/templates/aws_podcasts/views/redirect.mustache` with meta refresh, canonical, and JS redirect
    - Create `toucan/templates/aws_podcasts/views/sitemap.mustache` iterating over context.pages and context.podcasts
    - Update `toucan/templates/aws_podcasts/views/partials/head.mustache` to use `{{site.name}}` and `{{baseUrl}}`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11_

  - [ ]* 14.2 Write property test for new template files
    - **Property 6: New Template File Creation**
    - **Validates: Requirements 10.1-10.2, 10.3, 10.5, 10.7, 10.9**
    - Verify all new RC1 template files exist with correct content
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.7, 10.9_

- [ ] 15. Implement pagination calculation update
  - [ ] 15.1 Update episodes partial in TemplateTransformer
    - Modify `toucan/templates/aws_podcasts/views/partials/home/episodes.mustache`
    - Replace `{{count(pagination.links.podcast)}}` with `Math.ceil({{count(context.podcasts)}} / 10)`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 15.2 Write unit test for pagination calculation
    - Test with 350 episodes (should calculate 35 pages)
    - Test with various episode counts
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [ ] 16. Checkpoint - Verify template transformation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement JavaScript null safety updates
  - [ ] 17.1 Update navigation.js in TemplateTransformer
    - Add null check before `document.getElementById('episodes_cards')` fetch call
    - Add null check before `document.querySelector('#scrollAnchor')` observer
    - Skip functionality gracefully when elements missing
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 17.2 Write unit tests for JavaScript updates
    - Test null safety with missing DOM elements
    - Verify no errors thrown when elements absent
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 18. Implement asset relocation
  - [ ] 18.1 Create AssetRelocator class in `assets.py`
    - Implement safe_move() with integrity verification (checksum comparison)
    - Move all files from `toucan/themes/aws_podcasts/assets/` to `toucan/templates/aws_podcasts/assets/`
    - Preserve file permissions and timestamps
    - Verify CSS files valid after move (parse check)
    - Verify JavaScript files valid after move (syntax check)
    - Verify image files not corrupted (size/format check)
    - Verify font files not corrupted (size check)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 18.2 Write property test for asset relocation
    - **Property 10: Asset Relocation and Integrity**
    - **Validates: Requirements 15.1-15.6**
    - Verify all assets moved without corruption
    - Test with various asset types
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [ ] 19. Implement package.json script updates
  - [ ] 19.1 Update copy script in MigrationOrchestrator
    - Read `package.json`
    - Replace all occurrences of `toucan/themes/aws_podcasts/` with `toucan/templates/aws_podcasts/` in "copy" script
    - Maintain same copy operations (css, fonts, images, js, index.html)
    - Write updated `package.json`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 19.2 Write unit test for package.json updates
    - Verify copy script paths updated correctly
    - Verify other scripts unchanged
    - _Requirements: 12.1, 12.2, 12.3_

- [ ] 20. Implement post-migration validation
  - [ ] 20.1 Create PostMigrationValidator class in `validation.py`
    - Verify no files remain in `toucan/themes/` directory
    - Verify `toucan/config.yaml` does not exist
    - Verify `toucan/contents/index.yaml` does not exist
    - Verify all required pipeline files exist in `toucan/pipelines/`
    - Verify all required type files exist in `toucan/types/`
    - Verify `toucan.yml` exists at project root
    - Verify `toucan/site.yml` exists
    - Verify `toucan/config.yml` exists
    - Verify all mustache files use RC1 variable syntax (no beta patterns)
    - Verify episode count matches pre-migration count
    - Verify all YAML files are valid (parseable)
    - Verify all mustache files have valid syntax
    - Verify asset integrity
    - _Requirements: 1.7, 14.1, 14.2, 14.3, 14.4, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10_

  - [ ]* 20.2 Write property test for beta file cleanup
    - **Property 11: Beta File Cleanup**
    - **Validates: Requirements 3.10, 6.11, 17.1-17.3**
    - Verify no beta-era files remain after migration
    - _Requirements: 3.10, 6.11, 17.1, 17.2, 17.3_

  - [ ]* 20.3 Write property test for episode preservation
    - **Property 9: Episode Data Preservation (post-check)**
    - **Validates: Requirements 1.7, 14.1-14.4**
    - Verify episode count unchanged and all content intact
    - _Requirements: 1.7, 14.1, 14.2, 14.3, 14.4_

  - [ ]* 20.4 Write property test for language content preservation
    - **Property 14: Language Content Preservation**
    - **Validates: Requirements 4.3, 4.5, 19.1-19.3, 19.5-19.6**
    - Verify all French/English text unchanged
    - _Requirements: 4.3, 4.5, 19.1, 19.2, 19.3, 19.5, 19.6_

- [ ] 21. Implement migration report generation
  - [ ] 21.1 Create ReportGenerator class in `logger.py`
    - Generate summary statistics (files moved, created, deleted, transformed)
    - List all errors and warnings encountered
    - Include migration duration
    - Write report to `migration-log.txt`
    - Display summary to console
    - _Requirements: 17.10, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

  - [ ]* 21.2 Write property test for migration logging
    - **Property 18: Migration Log Completeness**
    - **Validates: Requirements 17.10, 20.1-20.6**
    - Verify log contains all operations with timestamps
    - _Requirements: 17.10, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

- [ ] 22. Implement error handling and rollback
  - [ ] 22.1 Add error handling to MigrationOrchestrator
    - Catch file operation errors (permission denied, disk space, path conflicts)
    - Catch transformation errors (invalid YAML, invalid mustache, encoding issues)
    - Trigger automatic rollback on critical errors (episode loss, data corruption)
    - Log all errors with context (timestamp, phase, operation, file path)
    - Implement exit codes (0=success, 1=pre-validation failed, 2=migration failed, 3=post-validation failed, 4=rollback failed)
    - _Requirements: All requirements (error handling for entire migration)_

  - [ ]* 22.2 Write unit tests for error handling
    - Test rollback on file operation errors
    - Test rollback on validation failures
    - Test error logging
    - Test exit codes
    - _Requirements: All requirements_

- [ ] 23. Implement build configuration preservation
  - [ ] 23.1 Add preservation checks to MigrationOrchestrator
    - Verify `webpack.config.js` unchanged after migration
    - Verify `postcss.config.js` unchanged after migration
    - Verify `package.json` dependencies unchanged (only copy script modified)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 23.2 Write property test for build configuration preservation
    - **Property 15: Build Configuration Preservation**
    - **Validates: Requirements 18.1-18.3**
    - Verify build configs unchanged
    - _Requirements: 18.1, 18.2, 18.3_

- [ ] 24. Final checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 25. Create migration documentation
  - [ ] 26.1 Create `docs/migration-guide.md`
    - Document pre-migration checklist (backup, commit, verify episode count, check disk space)
    - Document migration command and flags
    - Document post-migration steps (test build, test site generation, verify output, deploy test)
    - Document rollback procedure (automatic and manual)
    - _Requirements: All requirements (user documentation)_

  - [ ] 26.2 Create `docs/troubleshooting.md`
    - Document common issues and solutions (permission denied, episode count mismatch, Toucan RC1 errors, webpack errors, RSS feed errors, migration hangs)
    - Document how to read migration log
    - Document how to verify migration success
    - _Requirements: All requirements (troubleshooting guide)_

- [ ] 27. Create README for migration script
  - [ ] 27.1 Create `scripts/README-migration.md`
    - Document script purpose and overview
    - Document requirements (Python 3.9+, dependencies)
    - Document usage examples (basic, dry-run, verbose, custom backup)
    - Document exit codes
    - Link to migration guide and troubleshooting docs
    - _Requirements: All requirements (script documentation)_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties across varying inputs
- Unit tests validate specific examples and edge cases
- The migration is designed to be safe (backup/rollback), validated (18 properties), idempotent (safe to re-run), and logged (complete operation history)
- Implementation uses Python 3.9+ with PyYAML for YAML parsing and pystache for mustache validation
- Total estimated migration time: 30-60 seconds for 350 episodes
