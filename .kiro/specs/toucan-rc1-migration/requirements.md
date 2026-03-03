# Requirements Document: Toucan RC1 Migration

## Introduction

This document specifies the requirements for migrating the AWS French Podcast static website from Toucan beta to Toucan RC1. The migration involves significant structural changes to the project organization, configuration system, template architecture, and content structure while maintaining all existing functionality and content.

The migration affects the static site generator configuration, directory structure, template variables, pipeline definitions, and type system. All 350+ podcast episodes and their metadata must remain intact and functional after migration.

## Glossary

- **Toucan**: Static site generator used to build the podcast website
- **Toucan_Beta**: Current version of Toucan in use (pre-1.0)
- **Toucan_RC1**: Target version for migration (Release Candidate 1, version 1.0.0-beta.5+)
- **Template**: Mustache template file used to render HTML pages
- **Pipeline**: Configuration file defining how content types are processed and output
- **Content_Type**: Classification of content (page, podcast, rss, sitemap, redirect, not-found)
- **Frontmatter**: YAML metadata at the top of markdown content files
- **Site_Configuration**: Global site settings and variables
- **Type_Definition**: Schema defining properties and behavior of content types
- **Iterator**: Configuration for paginated content display
- **Query**: Configuration for retrieving and filtering content
- **Asset**: Static files (CSS, JS, images, fonts) used by templates
- **View**: Mustache template file that renders a specific content type
- **Slug**: URL path for a content item
- **Permalink**: Full URL to a content item

## Requirements

### Requirement 1: Migrate Directory Structure

**User Story:** As a developer, I want the project directory structure to match Toucan RC1 conventions, so that the static site generator can locate and process all files correctly.

#### Acceptance Criteria

1. THE Migration_System SHALL rename the directory `toucan/themes/` to `toucan/templates/`
2. THE Migration_System SHALL move the file `toucan/contents/index.yaml` to `toucan/site.yml`
3. THE Migration_System SHALL rename the file `toucan/config.yaml` to `toucan/config.yml`
4. THE Migration_System SHALL rename the directory `toucan/contents/home/` to `toucan/contents/[home]/`
5. THE Migration_System SHALL rename the directory `toucan/contents/episodes/pagination/` to `toucan/contents/episodes/{{podcast.pagination}}/`
6. THE Migration_System SHALL rename the directory `toucan/themes/aws_podcasts/templates/` to `toucan/templates/aws_podcasts/views/`
7. WHEN all directory migrations are complete, THE Migration_System SHALL verify that all 350+ episode directories remain in `toucan/contents/episodes/{episode_number}/`

### Requirement 2: Create Root Configuration File

**User Story:** As a developer, I want a root-level Toucan configuration file, so that I can define build targets and deployment configurations.

#### Acceptance Criteria

1. THE Migration_System SHALL create the file `toucan.yml` at the project root
2. THE Configuration_File SHALL define a target named "dev" with config path "toucan" and input path "toucan"
3. THE Configuration_File SHALL define a target named "live" with config path "toucan", input path "toucan", and URL "https://francais.podcast.go-aws.com/web/"
4. THE Configuration_File SHALL set "dev" as the default target
5. THE Configuration_File SHALL use YAML format with proper indentation

### Requirement 3: Transform Site Configuration Structure

**User Story:** As a developer, I want the site configuration to use RC1 structure, so that Toucan RC1 can correctly parse and apply site settings.

#### Acceptance Criteria

1. THE Migration_System SHALL replace `toucan/config.yaml` with `toucan/config.yml` containing RC1 structure
2. THE New_Configuration SHALL define site settings path as "toucan"
3. THE New_Configuration SHALL define blocks path as "toucan/blocks"
4. THE New_Configuration SHALL define contents path as "toucan/contents"
5. THE New_Configuration SHALL define pipelines path as "toucan/pipelines"
6. THE New_Configuration SHALL define templates location path as "toucan/templates"
7. THE New_Configuration SHALL define templates current path as "aws_podcasts"
8. THE New_Configuration SHALL define types path as "toucan/types"
9. THE New_Configuration SHALL define date input format as "yyyy-MM-dd HH:mm:ss Z"
10. THE Migration_System SHALL delete the original `toucan/config.yaml` file

### Requirement 4: Transform Site Variables File

**User Story:** As a developer, I want site-wide variables properly structured for RC1, so that templates can access global configuration data.

#### Acceptance Criteria

1. THE Migration_System SHALL rename the YAML key `title` to `name` in `toucan/site.yml`
2. THE Migration_System SHALL remove the `dateFormat` key from `toucan/site.yml`
3. THE Migration_System SHALL preserve all other existing keys and values in `toucan/site.yml`
4. WHEN the file is transformed, THE Migration_System SHALL maintain valid YAML syntax
5. THE Transformed_File SHALL retain all French language content unchanged

### Requirement 5: Create Pipeline Configuration Files

**User Story:** As a developer, I want pipeline configurations for each output type, so that Toucan RC1 can process and generate the correct output files.

#### Acceptance Criteria

1. THE Migration_System SHALL create the directory `toucan/pipelines/`
2. THE Migration_System SHALL create `toucan/pipelines/html.yml` for HTML page generation
3. THE Migration_System SHALL create `toucan/pipelines/rss.yml` for RSS feed generation
4. THE Migration_System SHALL create `toucan/pipelines/sitemap.yml` for sitemap generation
5. THE Migration_System SHALL create `toucan/pipelines/404.yml` for 404 page handling
6. THE Migration_System SHALL create `toucan/pipelines/redirect.yml` for redirect handling
7. THE HTML_Pipeline SHALL define content types "page" and "podcast"
8. THE HTML_Pipeline SHALL define iterator "podcast.pagination" with limit 10 and descending publication order
9. THE HTML_Pipeline SHALL define query "latest" for most recent podcast episode
10. THE HTML_Pipeline SHALL define query "podcasts" for all podcast episodes
11. THE HTML_Pipeline SHALL configure asset copying behavior
12. THE RSS_Pipeline SHALL set "definesType" to true
13. THE Sitemap_Pipeline SHALL define queries for pages and podcasts with lastUpdate ordering
14. THE Sitemap_Pipeline SHALL define date format "sitemap" as "yyyy-MM-dd"

### Requirement 6: Create Type Definition Files

**User Story:** As a developer, I want type definitions for all content types, so that Toucan RC1 can validate and process content correctly.

#### Acceptance Criteria

1. THE Migration_System SHALL create the directory `toucan/types/`
2. THE Migration_System SHALL create `toucan/types/page.yml` with id "page" and default set to true
3. THE Migration_System SHALL create `toucan/types/podcast.yaml` with id "podcast" and paths ["episodes"]
4. THE Podcast_Type SHALL define required string property "title"
5. THE Podcast_Type SHALL define required date property "publication"
6. THE Podcast_Type SHALL define optional asset property "image"
7. THE Migration_System SHALL create `toucan/types/not-found.yml` with id "not-found" and paths ["404"]
8. THE Migration_System SHALL create `toucan/types/redirect.yml` with id "redirect"
9. THE Redirect_Type SHALL define required string property "to"
10. THE Redirect_Type SHALL define optional int property "code" with default value 301
11. THE Migration_System SHALL delete `toucan/themes/aws_podcasts/types/podcast.yaml`

### Requirement 7: Create Special Content Files

**User Story:** As a developer, I want special content files for RSS, sitemap, and 404 pages, so that Toucan RC1 can generate these auxiliary pages.

#### Acceptance Criteria

1. THE Migration_System SHALL create `toucan/contents/404/index.md` with type "not-found"
2. THE 404_Content SHALL include title "404" and description "Page not found"
3. THE 404_Content SHALL include markdown content with "Not found" heading and home link
4. THE Migration_System SHALL create `toucan/contents/rss.xml/index.yml` with type "rss"
5. THE Migration_System SHALL create `toucan/contents/sitemap.xml/index.yml` with type "sitemap"

### Requirement 8: Update Content Frontmatter

**User Story:** As a developer, I want content frontmatter updated to RC1 format, so that Toucan RC1 can correctly parse content metadata.

#### Acceptance Criteria

1. THE Migration_System SHALL replace `template: "pages.home"` with `views:\n    html: "pages.home"` in `toucan/contents/[home]/index.md`
2. THE Migration_System SHALL update `toucan/contents/episodes/{{podcast.pagination}}/index.md` to use type "page"
3. THE Pagination_Content SHALL use `views:\n    html: pages.episode_pagination` instead of `template`
4. THE Pagination_Content SHALL use slug `episodes/pages/{{podcast.pagination}}`
5. WHEN frontmatter is updated, THE Migration_System SHALL preserve all other metadata fields

### Requirement 9: Transform Template Variable References

**User Story:** As a developer, I want template variables updated to RC1 syntax, so that templates render correctly with the new variable structure.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all occurrences of `{{site.baseUrl}}` with `{{baseUrl}}` in all mustache files
2. THE Migration_System SHALL replace all occurrences of `{{site.title}}` with `{{site.name}}` in all mustache files
3. THE Migration_System SHALL replace all occurrences of `{{site.context.latest}}` with `{{context.latest}}` in all mustache files
4. THE Migration_System SHALL replace all occurrences of `{{pagination.data.podcast}}` with `{{iterator.items}}` in all mustache files
5. THE Migration_System SHALL replace all occurrences of `{{& page.contents}}` with `{{& page.contents.html}}` in all mustache files
6. THE Migration_System SHALL replace all occurrences of `{{medialink}}` with `{{site.medialink}}` in all mustache files
7. THE Migration_System SHALL replace all occurrences of `{{imagelink}}` with `{{site.imagelink}}` in all mustache files
8. THE Migration_System SHALL replace standalone variable references (not prefixed with site.) with `{{site.variableName}}` for site-level variables
9. WHEN variable transformations are complete, THE Migration_System SHALL verify all mustache files have valid syntax

### Requirement 10: Create New Template Files

**User Story:** As a developer, I want new template files for RC1 features, so that all content types can be properly rendered.

#### Acceptance Criteria

1. THE Migration_System SHALL create `toucan/templates/aws_podcasts/template.yml` with template metadata
2. THE Template_Metadata SHALL include name, description, version "1.0.0-beta.5", and generator versions
3. THE Migration_System SHALL create `toucan/templates/aws_podcasts/views/pages/404.mustache` for 404 page rendering
4. THE 404_Template SHALL extend html layout and render `{{& page.contents.html}}`
5. THE Migration_System SHALL create `toucan/templates/aws_podcasts/views/pages/default.mustache` for default page rendering
6. THE Default_Template SHALL extend html layout and render `{{& page.contents.html}}`
7. THE Migration_System SHALL create `toucan/templates/aws_podcasts/views/redirect.mustache` for redirect handling
8. THE Redirect_Template SHALL include meta refresh, canonical link, and JavaScript redirect to `{{baseUrl}}/{{page.to}}`
9. THE Migration_System SHALL create `toucan/templates/aws_podcasts/views/sitemap.mustache` for sitemap XML generation
10. THE Sitemap_Template SHALL iterate over `{{context.pages}}` and `{{context.podcasts}}` with permalink and lastUpdate
11. THE Migration_System SHALL update `toucan/templates/aws_podcasts/views/partials/head.mustache` to use `{{site.name}}` and `{{baseUrl}}`

### Requirement 11: Update JavaScript for Null Safety

**User Story:** As a developer, I want JavaScript code to handle missing DOM elements gracefully, so that pages without certain elements do not throw errors.

#### Acceptance Criteria

1. THE Migration_System SHALL add null check before `fetch()` call in `toucan/templates/aws_podcasts/assets/js/navigation.js`
2. THE Navigation_Script SHALL verify `document.getElementById('episodes_cards')` exists before loading pages
3. THE Navigation_Script SHALL verify `document.querySelector('#scrollAnchor')` exists before observing
4. WHEN DOM elements are missing, THE Navigation_Script SHALL skip the related functionality without errors

### Requirement 12: Update Package.json Copy Script

**User Story:** As a developer, I want the npm copy script updated for the new directory structure, so that built assets are copied to the correct location.

#### Acceptance Criteria

1. THE Migration_System SHALL update the "copy" script in `package.json`
2. THE Copy_Script SHALL replace all occurrences of `toucan/themes/aws_podcasts/` with `toucan/templates/aws_podcasts/`
3. THE Copy_Script SHALL maintain the same copy operations for css, fonts, images, js, and index.html
4. WHEN the script runs, THE Copy_Script SHALL copy files from `build/` to `toucan/templates/aws_podcasts/assets/`

### Requirement 13: Update Pagination Calculation

**User Story:** As a developer, I want pagination to calculate correctly based on total podcast count, so that all episodes are accessible through pagination.

#### Acceptance Criteria

1. THE Migration_System SHALL update `toucan/templates/aws_podcasts/views/partials/home/episodes.mustache`
2. THE Episodes_Partial SHALL calculate maxPages as `Math.ceil(maxPodcast / 10)` where maxPodcast is `{{count(context.podcasts)}}`
3. THE Episodes_Partial SHALL replace `{{count(pagination.links.podcast)}}` with the new calculation
4. WHEN 350 episodes exist, THE Pagination SHALL calculate 35 pages

### Requirement 14: Preserve All Episode Content

**User Story:** As a developer, I want all existing episode content preserved during migration, so that no podcast data is lost.

#### Acceptance Criteria

1. THE Migration_System SHALL verify all episode directories in `toucan/contents/episodes/` remain unchanged
2. THE Migration_System SHALL verify all episode `index.md` files retain their frontmatter and content
3. THE Migration_System SHALL verify episode numbers 001 through 350 are all present
4. WHEN migration is complete, THE Migration_System SHALL confirm episode count matches pre-migration count

### Requirement 15: Maintain Asset File Integrity

**User Story:** As a developer, I want all asset files moved without corruption, so that the website appearance and functionality remain identical.

#### Acceptance Criteria

1. THE Migration_System SHALL move all files from `toucan/themes/aws_podcasts/assets/` to `toucan/templates/aws_podcasts/assets/`
2. THE Migration_System SHALL preserve file permissions and timestamps during move
3. THE Migration_System SHALL verify CSS files are valid after move
4. THE Migration_System SHALL verify JavaScript files are valid after move
5. THE Migration_System SHALL verify image files are not corrupted after move
6. THE Migration_System SHALL verify font files are not corrupted after move

### Requirement 16: Update RSS Feed Template

**User Story:** As a developer, I want the RSS feed template updated for RC1 variable structure, so that the podcast RSS feed continues to work correctly.

#### Acceptance Criteria

1. THE Migration_System SHALL update `toucan/templates/aws_podcasts/views/rss.mustache`
2. THE RSS_Template SHALL use `{{site.imagelink}}` instead of `{{imagelink}}`
3. THE RSS_Template SHALL use `{{site.medialink}}` instead of `{{medialink}}`
4. THE RSS_Template SHALL use `{{site.rss.artwork}}` instead of `{{rss.artwork}}`
5. THE RSS_Template SHALL use `{{site.rss.owner.name}}` and `{{site.rss.owner.email}}` instead of direct references
6. WHEN the RSS feed is generated, THE RSS_Template SHALL produce valid RSS 2.0 XML

### Requirement 17: Validate Migration Completeness

**User Story:** As a developer, I want validation that the migration is complete and correct, so that I can confidently use Toucan RC1.

#### Acceptance Criteria

1. THE Migration_System SHALL verify no files remain in `toucan/themes/` directory
2. THE Migration_System SHALL verify `toucan/config.yaml` does not exist
3. THE Migration_System SHALL verify `toucan/contents/index.yaml` does not exist
4. THE Migration_System SHALL verify all required pipeline files exist in `toucan/pipelines/`
5. THE Migration_System SHALL verify all required type files exist in `toucan/types/`
6. THE Migration_System SHALL verify `toucan.yml` exists at project root
7. THE Migration_System SHALL verify `toucan/site.yml` exists
8. THE Migration_System SHALL verify `toucan/config.yml` exists
9. THE Migration_System SHALL verify all mustache files use RC1 variable syntax
10. THE Migration_System SHALL generate a migration report listing all changes made

### Requirement 18: Maintain Build Process Compatibility

**User Story:** As a developer, I want the webpack build process to remain functional, so that I can continue building assets before generating the site.

#### Acceptance Criteria

1. THE Migration_System SHALL preserve `webpack.config.js` unchanged
2. THE Migration_System SHALL preserve `package.json` dependencies unchanged except for the copy script
3. THE Migration_System SHALL preserve `postcss.config.js` unchanged
4. WHEN `npm run build` executes, THE Build_Process SHALL output files to `build/` directory
5. WHEN `npm run copy` executes, THE Copy_Script SHALL copy files to `toucan/templates/aws_podcasts/assets/`

### Requirement 19: Support Multiple Language Versions

**User Story:** As a developer, I want the migration to work for both French and English podcast sites, so that both language versions can be migrated using the same process.

#### Acceptance Criteria

1. THE Migration_System SHALL preserve language-specific content in `toucan/site.yml`
2. THE Migration_System SHALL preserve the `language` field in `toucan/site.yml`
3. THE Migration_System SHALL not modify any French or English text content
4. THE Migration_System SHALL apply the same structural changes regardless of content language
5. WHEN migrating the French site, THE Migration_System SHALL preserve all French text
6. WHEN migrating the English site, THE Migration_System SHALL preserve all English text

### Requirement 20: Document Migration Process

**User Story:** As a developer, I want documentation of the migration process, so that I understand what changed and can troubleshoot issues.

#### Acceptance Criteria

1. THE Migration_System SHALL create a migration log file listing all file operations
2. THE Migration_Log SHALL record all files moved, renamed, created, and deleted
3. THE Migration_Log SHALL record all template variable transformations
4. THE Migration_Log SHALL record any errors or warnings encountered
5. THE Migration_Log SHALL include timestamp for each operation
6. THE Migration_Log SHALL be saved as `migration-log.txt` in the project root
