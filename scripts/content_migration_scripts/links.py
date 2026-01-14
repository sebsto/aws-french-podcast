import os
import re
import yaml

def extract_links(content):
    # Find the content after the last '---'
    parts = content.split('---')
    if len(parts) < 2:
        return []
    
    body = parts[-1].strip()
    
    # Find all lines starting with '-' that contain markdown links
    link_pattern = r'^\s*-\s*\[([^\]]+)\]\(([^\)]+)\)'
    links = []
    
    for line in body.split('\n'):
        match = re.match(link_pattern, line)
        if match:
            text, link = match.groups()
            links.append({
                'text': text.strip(),
                'link': link.strip()
            })
    
    return links

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split the content into front matter and body
    parts = content.split('---', 2)
    if len(parts) < 3:
        print(f"Skipping {file_path}: No valid front matter found")
        return

    # Parse the existing front matter
    try:
        front_matter = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        print(f"Error parsing YAML in {file_path}")
        return

    # Extract links from the content
    links = extract_links(content)
    if links:
        # Add links to front matter
        front_matter['links'] = links

        # Create new content with updated front matter
        new_content = "---\n"
        new_content += yaml.dump(front_matter, allow_unicode=True, default_style='"', sort_keys=False)
        new_content += "---\n"

        # Write the modified content back to the file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    else:
        print(f"No links found in {file_path}")

def main():
    base_path = '../toucan/contents/episodes'
    
    # Walk through all .md files in the directory
    for root, dirs, files in os.walk(base_path):
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                print(f"Processing {file_path}")
                process_file(file_path)

if __name__ == "__main__":
    main()
