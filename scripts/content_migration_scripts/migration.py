#!/usr/bin/env python3

import os
import re
import yaml
import html
from datetime import datetime
from typing import Dict, Any, List, Optional, Union


def unescape_html_entities(text: str) -> str:
    """Unescape HTML entities in text while preserving valid HTML tags."""
    # First protect actual HTML tags by replacing < and > temporarily
    text = text.replace('<', '§TAGSTART§').replace('>', '§TAGEND§')
    # Unescape HTML entities
    text = html.unescape(text)
    # Restore HTML tags
    text = text.replace('§TAGSTART§', '<').replace('§TAGEND§', '>')
    return text

def parse_guest_info(guest_str: str) -> List[Dict[str, str]]:
    """Parse guest information from string into structured format."""
    guest_str = unescape_html_entities(guest_str.strip('"'))
    guests = []
    
    # Split multiple guests if separated by conjunctions
    guest_parts = re.split(r'\s+(?:et|and|\&amp;)\s+', guest_str, flags=re.IGNORECASE)
    
    for part in guest_parts:
        # Handle different formats of guest information
        # Format 1: <a href='link'>name</a>, title
        # Format 2: name (title)
        # Format 3: just name
        link_match = re.search(r'<a href=[\'"]([^\'"]+)[\'"]>([^<]+)</a>(?:,?\s*([^\.]+))?', part)
        paren_match = re.search(r'([^(]+)\s*\(([^)]+)\)', part)
        
        if link_match:
            link, name, title = link_match.groups()
            guest_info = {
                'name': name.strip().strip('"'),
                'link': link.strip()
            }
            if title:
                guest_info['title'] = title.strip().strip('"').rstrip('.')
            guests.append(guest_info)
        elif paren_match:
            name, title = paren_match.groups()
            guest_info = {
                'name': name.strip().strip('"'),
                'title': title.strip().strip('"')
            }
            guests.append(guest_info)
        elif part.strip():
            guests.append({'name': part.strip().strip('"')})
    
    return guests

def load_frontmatter(content: str) -> tuple[Dict[str, Any], str]:
    """Extract YAML frontmatter from markdown content."""
    if content.startswith('---\n'):
        parts = content.split('---\n', 2)
        if len(parts) >= 3:
            try:
                return yaml.safe_load(parts[1]), parts[2]
            except yaml.YAMLError:
                return {}, content
    return {}, content

def transform_frontmatter(fm: Dict[str, Any]) -> Dict[str, Any]:
    """Transform frontmatter from old format to new format."""
    new_fm = {}
    
    # Copy and unescape direct string fields
    direct_fields = ['title', 'description', 'episode', 'duration', 'size', 
                    'file', 'category', 'appleEpisodeId']
    for field in direct_fields:
        if field in fm:
            value = fm[field]
            if isinstance(value, str):
                value = unescape_html_entities(value)
            new_fm[field] = value
    
    # Transform guest field to guests list - only if guest field exists and is not None
    if 'guest' in fm and fm['guest'] is not None:
        new_fm['guests'] = parse_guest_info(fm['guest'])
    else:
        new_fm['guests'] = []  # or you might want to omit this field entirely
   
    
    # Transform date to publication
    if 'date' in fm:
        new_fm['publication'] = fm['date']
    
    # Handle author
    if 'author' in fm:
        new_fm['author'] = fm['author']
    
    # Handle backgrounds
    if 'social-background' in fm:
        new_fm['social-background'] = fm['social-background']
    if 'background' in fm:
        new_fm['background'] = fm['background']
    
    # Handle AWS categories if present
    if 'aws-categories' in fm:
        new_fm['aws-categories'] = fm['aws-categories']
    
    # Handle subtitle if present
    if 'subtitle' in fm:
        # Could optionally append to description or keep as separate field
        if 'description' in new_fm:
            new_fm['description'] = f"{fm['subtitle']}: {new_fm['description']}"
        else:
            new_fm['description'] = fm['subtitle']
    
    return new_fm


class MyDumper(yaml.Dumper):
    def increase_indent(self, flow=False, indentless=False):
        return super(MyDumper, self).increase_indent(flow, False)

class QuotedString(str):
    pass

def quoted_scalar(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='"')

# When writing the file, modify your values to use QuotedString for strings
def prepare_for_yaml(data):
    if isinstance(data, dict):
        return {k: prepare_for_yaml(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [prepare_for_yaml(item) for item in data]
    elif isinstance(data, str):
        return QuotedString(data)
    return data

# Register the string representer
MyDumper.add_representer(QuotedString, quoted_scalar)

def process_file(file_path: str) -> None:
    """Process a single markdown file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    frontmatter, body = load_frontmatter(content)
    if not frontmatter:
        print(f"Warning: No valid frontmatter found in {file_path}")
        return
    
    new_frontmatter = transform_frontmatter(frontmatter)
    
    # Write back to file
    with open(file_path, 'w', encoding='utf-8') as f:
        prepared_data = prepare_for_yaml(new_frontmatter)
        yaml.dump(prepared_data, f, 
                allow_unicode=True, 
                sort_keys=False,
                Dumper=MyDumper,
                width=float('inf'))
        f.write('---\n')
        f.write(body)

def main():
    podcast_dir = '_podcasts'
    for filename in os.listdir(podcast_dir):
        if filename.endswith('.md') and filename.startswith('episode_'):
            file_path = os.path.join(podcast_dir, filename)
            print(f"Processing {filename}...")
            process_file(file_path)

if __name__ == '__main__':
    main()