const { Titlebar } = require("../app/titlebar");
const path = require("path");

window.addEventListener('DOMContentLoaded', () => {
  // Title bar:
  const options = {
    icon: path.join(__dirname, 'images', 'icon.png'),
    removeMenuBar: true
  };
  new Titlebar(options);
});