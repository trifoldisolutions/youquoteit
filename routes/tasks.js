const express = require('express');
const router = express.Router();
const Task = require('../models/Task');

router.get('/tasks', async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.render('tasks', { title: 'Task Board', tasks });
});

router.post('/tasks', async (req, res) => {
  const { title, description } = req.body;
  await Task.create({ title, description });
  res.redirect('/dev-resources/tasks');
});

router.post('/tasks/:id/update', async (req, res) => {
  const { title, description, status } = req.body;
  await Task.findByIdAndUpdate(req.params.id, { title, description, status });
  res.redirect('/dev-resources/tasks');
});

router.post('/tasks/:id/delete', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.redirect('/dev-resources/tasks');
});

router.routes = [
  { method: 'GET', path: '/dev-resources/tasks', label: 'Internal task board' },
  { method: 'POST', path: '/dev-resources/tasks', label: 'Create task' },
  { method: 'POST', path: '/dev-resources/tasks/:id/update', label: 'Update task' },
  { method: 'POST', path: '/dev-resources/tasks/:id/delete', label: 'Delete task' },
];

module.exports = router;
