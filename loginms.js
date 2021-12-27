var email = document.getElementById("email")
var nexpect = require('nexpect');
var output = document.getElementById('output');

document.getElementById("exit").addEventListener("click", function (e) {
  window.close();
});

document.getElementById("login").addEventListener("click", function (e) {
  console.log(email.value)
  correctlog = false
  
  console.log(correctlog)
});

document.getElementById("logout").addEventListener("click", function (e) {
  console.log(email.value)
  
  localStorage.clear();
  console.log("localstorage cleared!")
  output.innerHTML = 'Logged out Correctly'
});