import os

def add_frontmatter_delimiter(base_dir='_podcasts'):
    # Walk through all directories and subdirectories
    for root, dirs, files in os.walk(base_dir):
        # Process only .md files
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                
                # Read the current content
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Check if file already starts with ---
                    if not content.startswith('---\n'):
                        # Prepend --- to the content
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write('---\n' + content)
                        print(f"Added frontmatter delimiter to {file_path}")
                    else:
                        print(f"Skipping {file_path} - already has frontmatter delimiter")
                        
                except Exception as e:
                    print(f"Error processing {file_path}: {str(e)}")

if __name__ == "__main__":
    add_frontmatter_delimiter()
