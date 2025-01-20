import os
import shutil
import re

def extract_episode_number(filename):
    # Match episode number from filenames like episode_123.md
    match = re.search(r'episode_(\d+)\.md', filename)
    if match:
        return match.group(1)
    return None

def reorganize_episodes(base_dir='_podcasts'):
    # Ensure base directory exists
    if not os.path.exists(base_dir):
        print(f"Directory {base_dir} does not exist!")
        return

    # Iterate through all .md files in the directory
    for filename in os.listdir(base_dir):
        if not filename.endswith('.md'):
            continue

        # Get the full path of the source file
        source_file = os.path.join(base_dir, filename)
        
        # Extract episode number
        episode_num = extract_episode_number(filename)
        
        if episode_num:
            # Create new directory path
            new_dir = os.path.join(base_dir, episode_num)
            
            # Create the new directory if it doesn't exist
            os.makedirs(new_dir, exist_ok=True)
            
            # Define the destination path
            dest_file = os.path.join(new_dir, 'index.md')
            
            # Move and rename the file
            try:
                shutil.move(source_file, dest_file)
                print(f"Moved {filename} to {dest_file}")
            except Exception as e:
                print(f"Error moving {filename}: {str(e)}")
        else:
            print(f"Skipping {filename} - no episode number found")

if __name__ == "__main__":
    reorganize_episodes()
