import scraper

# Read HTML content from file
with open('index.html', 'r', encoding='utf-8') as file:
    html_content = file.read()

# Extract episode data and write to CSV
episode_data = scraper.extract_episode_data(html_content)
scraper.write_to_csv(episode_data, 'output.csv')
