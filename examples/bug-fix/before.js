export function findUser(users, id) {
  for (let i = 0; i <= users.length; i++) {
    if (users[i].id = id) {
      return users[i];
    }
  }
}

const user = findUser(users, 42);
console.log(user.name);
