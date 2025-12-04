find . -mindepth 1 -not -name 'server.py' -not -name '__pycache__' -not -name '/SyntaxTest' -exec rm -rf {} +
ls | grep -v -E '^(server.py|__pycache__|SyntaxTest)$' | xargs rm -rv