// load a blog of episodes. 
// apply JS-based renderers on the newly loaded elements
function loadPage(page) {
		fetch(`episodes/pages/${page}/index.html`)
				.then(response => response.text())
				.then(data => {
					// Parse the fetched HTML string into a DOM
					let parser = new DOMParser();
					let doc = parser.parseFromString(data, 'text/html');

					// apply JS-based renderers on the newly loaded elements
					applyRenderers(doc);

					// Append the parsed and modified DOM to the existing content
					let element = document.getElementById('episodes_cards');
					if (element) {
						let existing = element.innerHTML
						element.innerHTML = existing + doc.body.innerHTML;
					}
				})
				.catch(error => {
						console.error('Error loading page:', error);
				});
}

// Function to handle new content added to the page
function handleNewContent(mutationsList, observer) {
	console.log('New content added');
	applyRenderers();
	// initAudioPlayer();
}

function createObserver() {
	let options = {
			root: null,
			rootMargin: '0px',
			threshold: 1.0
	};

	let observer_infinite_scrolling = new IntersectionObserver(handleIntersect, options);
	let scrollAnchor = document.querySelector('#scrollAnchor');
	if (scrollAnchor) {
		observer_infinite_scrolling.observe(scrollAnchor);
	}

	/*
	// Create an observer instance linked to the callback function
	const observer = new MutationObserver(handleNewContent);

	// Options for the observer (which mutations to observe)
	const config = { childList: true, subtree: true };

	// Target node to observe
	const targetNode = document.getElementById('episodes_cards');

	// Start observing the target node for configured mutations
	observer.observe(targetNode, config);
	*/
}

/* 
  maxPages is defined and initialized in templates/partial/home/episodes.mustache
*/
const MAX_AUTO_LOAD_PAGES = 3; // Stop infinite scroll after 3 pages (30 episodes)

function handleIntersect(entries, observer) {
	entries.forEach(entry => {
		if (entry.isIntersecting) {
			if (currentPage >= MAX_AUTO_LOAD_PAGES && currentPage < maxPages) {
				console.log("Pausing infinite scroll - showing Load More button");
				observer.disconnect();
				showLoadMoreButton();
			} else if (currentPage < maxPages) {
				currentPage++;
				console.log("loading page: " + currentPage);
				loadPage(currentPage);
			} else {
				console.log("No more pages to load");
				observer.disconnect();
			}
		}
	});
}

function showLoadMoreButton() {
	let scrollAnchor = document.querySelector('#scrollAnchor');
	if (scrollAnchor) {
		scrollAnchor.innerHTML = `
			<div class="col-12 d-flex align-items-center justify-content-center py-5">
				<button class="btn bg-light text-dark hover-gradient-1 cta-with-icon" id="loadMoreBtn">
					<span class="cta__text cta__text--left">Load 10 more episodes</span>
					<span class="cta__icon">
						<svg>
							<use xlink:href="episodes/images/arrow-right.svg#arrow-right"></use>
						</svg>
					</span>
				</button>
			</div>
		`;
		
		document.getElementById('loadMoreBtn').addEventListener('click', function() {
			if (currentPage < maxPages) {
				currentPage++;
				console.log("loading page: " + currentPage);
				loadPage(currentPage);
				
				if (currentPage >= maxPages) {
					scrollAnchor.innerHTML = '';
				} else {
					// Re-create observer for next batch
					createObserver();
				}
			}
		});
	}
}

let currentPage = 1;

// Load the first page initially
loadPage(currentPage);

// Create the observer for infinite scrolling
createObserver();