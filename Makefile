test:
	find . \
		-type d \
		-maxdepth 1 \
		! -name .git \
		-exec sh -c 'echo {} && cd {} && yarn test-ci' ';'
