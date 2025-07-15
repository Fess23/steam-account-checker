<h1 align="center" id="title">Steam account checker</h1>

<p id="description" align="center">This is a simple steam account checker that supports proxies and concurrent account checking on Node.js</p>

<p align="center"><img src="https://img.shields.io/badge/build-Working-brightgreen?style=flat-square" alt="shields"></p>

<h2>🚀 Requirments</h2>

<p>Node.js 20+</p>
<p>NPM</p>
<p>Local bind proxies (tested on: 9Proxy)</p>
  
<h2>🧐 Features</h2>

Here're some of the project's best features:

*   Concurrent account checking for high performance
*   Full support for proxy usage
*   Easily configurable settings
*   Written entirely with asynchronous code for optimal efficiency

<h2>🛠️ Installation Steps:</h2>

<p>1. Download the repository</p>

```
git clone repo_url
```

<p>2. Install npm packages</p>

```
npm install
```

<p>3. Get to know the arguments for launching</p>

<h2>Options</h2>
<ul>
  <li><code>--version</code>  
    <span>Show version number</span> <strong>[boolean]</strong>
  </li>
  
  <li><code>-v, --valid</code>  
    <span>Name of the file to save valid accounts</span>  
    <strong>[string]</strong> <em>Default: "valid.txt"</em>
  </li>
  
  <li><code>-i, --invalid</code>  
    <span>Name of the file to save invalid accounts</span>  
    <strong>[string]</strong> <em>Default: "invalid.txt"</em>
  </li>
  
  <li><code>-t, --timeout</code>  
    <span>Timeout after maximum failed logins (in ms)</span>  
    <strong>[number]</strong> <em>Default: 300000</em>
  </li>
  
  <li><code>-m, --max-fails</code>  
    <span>Maximum number of failed logins before pausing the script</span>  
    <strong>[number]</strong> <em>Default: 3</em>
  </li>
  
  <li><code>-c, --concurrents</code>  
    <span>Number of concurrent logins</span>  
    <strong>[number]</strong> <em>Default: 1</em>
  </li>
  
  <li><code>-d, --debug</code>  
    <span>Enable debug mode</span>  
    <strong>[boolean]</strong> <em>Default: false</em>
  </li>
  
  <li><code>-r, --rejectGuard</code>  
    <span>Reject accounts which use Steam Guard Verification</span>  
    <strong>[boolean]</strong> <em>Default: true</em>
  </li>
  
  <li><code>-p, --proxys</code>  
    <span>Path to the proxy file. All proxies must be in the format <code>ip:port</code></span>  
    <strong>[string]</strong>
  </li>
  
  <li><code>-a, --accounts</code>  
    <span>Path to the account file. All accounts must be in the format <code>login:password</code></span>  
    <strong>[string]</strong> <em><strong>[required]</strong></em>
  </li>
  
  <li><code>--help</code>  
    <span>Show help</span> <strong>[boolean]</strong>
  </li>
</ul>

Or via -help

```
node index.js -help
```

<p>4. Start the checker (example settings)</p>

```
node index.js -a accounts.txt -p proxys.txt -c 4
```