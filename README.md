# KeplerTeX: Cloud-First LaTeX for Visual Studio Code

Write LaTeX, not configuration. Compile instantly without any local TeX installation.

KeplerTeX is a high-performance VS Code extension designed to offload the heavy lifting of LaTeX compilation to the cloud. By leveraging a serverless architecture, KeplerTeX eliminates the need for gigabyte-scale local installations like TeX Live or MiKTeX, providing a seamless, zero-install experience for academics, researchers, and students.

---

## Key Features

- Zero-Install Compilation: Compile complex .tex documents without a local LaTeX environment.
- Lightning Fast Preview: Real-time PDF updates via integrated webview on every save (Cmd+S / Ctrl+S).
- Serverless Backend: Powered by AWS Lambda for scalable, on-demand document generation.
- Integrated Auth: Seamless GitHub-based authentication to manage your cloud resources.
- Minimalist Workflow: Single shortcuts for compilation and focus management to keep you in the zone.

## Technical Architecture

KeplerTeX follows a modern, distributed architecture to ensure stability and speed.

- Frontend: A TypeScript-based VS Code extension that handles editor logic, secure storage, and PDF rendering.
- API Gateway: Orchestrates requests between the extension and the compilation engine.
- Compute Cluster: AWS Lambda-based serverless functions that invoke high-speed LaTeX engines in isolated environments.
- Database: DynamoDB for session management and rate limiting, ensuring fair use for the community.

## Installation

1. Search for KeplerTeX in the VS Code Marketplace.
2. Click Install.
3. Open a .tex file.
4. Use Cmd+K to log in and start compiling!

## Requirements

- Visual Studio Code: v1.80+
- Internet Connection: Required for cloud compilation.

## Contributing

We welcome contributions from the community! Whether it's fixing bugs, adding features, or improving documentation:

1. Fork the repository.
2. Create a feature branch (git checkout -b feature/AmazingFeature).
3. Commit your changes (git commit -m 'Add some AmazingFeature').
4. Push to the branch (git push origin feature/AmazingFeature).
5. Open a Pull Request.

Please see our CONTRIBUTING.md for more details.

## License

Distributed under the Apache-2.0 License. See LICENSE for more information.

---

Built for the LaTeX community.
