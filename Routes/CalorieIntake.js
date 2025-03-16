const express = require('express');
const router = express.Router();
const authTokenHandler = require('../Middlewares/checkAuthToken');
const jwt = require('jsonwebtoken');
const errorHandler = require('../Middlewares/errorMiddleware');
const request = require('request');
const User = require('../Models/UserSchema');
require('dotenv').config();
const fetch = require('node-fetch');  // Use require with node-fetch v2




function createResponse(ok, message, data) {
    return {
        ok,
        message,
        data,
    };
}

router.get('/test', authTokenHandler, async (req, res) => {
    res.json(createResponse(true, 'Test API works for calorie intake report'));
});

router.post('/addcalorieintake', authTokenHandler, async (req, res) => {
    const { item, quantity, date, quantitytype } = req.body;
    console.log("Item : ", item);
    console.log("quantity: ", quantity);
    console.log("quantitytype: ", quantitytype);
    console.log("date: ", date);

    if (!item || !date || !quantity || !quantitytype) {
        return res.status(400).json(createResponse(false, 'Please provide all the details'));
    }

    let qtyingrams = 0;
    if (quantitytype === 'g') {
        qtyingrams = quantity;
    }
    else if (quantitytype === 'kg') {
        qtyingrams = quantity * 1000;
    }
    else if (quantitytype === 'ml') {
        qtyingrams = quantity;
    }
    else if (quantitytype === 'l') {
        qtyingrams = quantity * 1000;
    }
    else {
        return res.status(400).json(createResponse(false, 'Invalid quantity type'));
    }

    const appId = process.env.EDAMAM_APP_ID;  // Get from .env file
    const appKey = process.env.EDAMAM_APP_KEY;  // Get from .env file

    try {
        // Fetch calorie information from Edamam API
        const response = await fetch(`https://api.edamam.com/api/nutrition-data?app_id=${appId}&app_key=${appKey}&ingr=${item}`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error('Error fetching data from Edamam');
        }

        const data = await response.json();

        if (data.calories) {
            let calorieIntake = (data.calories / 100) * parseInt(qtyingrams);

            const userId = req.userId;
            const user = await User.findOne({ _id: userId });

            user.calorieIntake.push({
                item,
                date: new Date(date),
                quantity,
                quantitytype,
                calorieIntake: parseInt(calorieIntake)
            });

            await user.save();
            res.json(createResponse(true, 'Calorie intake added successfully'));
        } else {
            res.status(400).json(createResponse(false, 'Could not retrieve calorie data'));
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json(createResponse(false, 'Internal server error'));
    }
});


router.post('/getcalorieintakebydate', authTokenHandler, async (req, res) => {
    const { date } = req.body;
    const userId = req.userId;
    const user = await User.findById({ _id: userId });
    if (!date) {
        let date = new Date();   // sept 1 2021 12:00:00
        user.calorieIntake = filterEntriesByDate(user.calorieIntake, date);

        return res.json(createResponse(true, 'Calorie intake for today', user.calorieIntake));
    }
    user.calorieIntake = filterEntriesByDate(user.calorieIntake, new Date(date));
    res.json(createResponse(true, 'Calorie intake for the date', user.calorieIntake));

})

router.post('/getcalorieintakebylimit', authTokenHandler, async (req, res) => {
    const { limit } = req.body;
    const userId = req.userId;
    const user = await User.findById({ _id: userId });
    if (!limit) {
        return res.status(400).json(createResponse(false, 'Please provide limit'));
    } else if (limit === 'all') {
        return res.json(createResponse(true, 'Calorie intake', user.calorieIntake));
    }
    else {


        let date = new Date();
        let currentDate = new Date(date.setDate(date.getDate() - parseInt(limit))).getTime();
        // 1678910

        user.calorieIntake = user.calorieIntake.filter((item) => {
            return new Date(item.date).getTime() >= currentDate;
        })


        return res.json(createResponse(true, `Calorie intake for the last ${limit} days`, user.calorieIntake));


    }
})


router.delete('/deletecalorieintake', authTokenHandler, async (req, res) => {
    const { item, date } = req.body;
    if (!item || !date) {
        return res.status(400).json(createResponse(false, 'Please provide all the details'));
    }

    const userId = req.userId;
    const user = await User.findById({ _id: userId });

    user.calorieIntake = user.calorieIntake.filter((entry) => {
        return entry.date.toString() !== new Date(date).toString();
    })
    await user.save();
    res.json(createResponse(true, 'Calorie intake deleted successfully'));

})

router.get('/getgoalcalorieintake', authTokenHandler, async (req, res) => {
    const userId = req.userId;
    const user = await User.findById({ _id: userId });
    let maxCalorieIntake = 0;
    let heightInCm = parseFloat(user.height[user.height.length - 1].height);
    let weightInKg = parseFloat(user.weight[user.weight.length - 1].weight);
    let age = new Date().getFullYear() - new Date(user.dob).getFullYear();
    let BMR = 0;
    let gender = user.gender;
    if (gender == 'male') {
        BMR = 88.362 + (13.397 * weightInKg) + (4.799 * heightInCm) - (5.677 * age)

    }
    else if (gender == 'female') {
        BMR = 447.593 + (9.247 * weightInKg) + (3.098 * heightInCm) - (4.330 * age)

    }
    else {
        BMR = 447.593 + (9.247 * weightInKg) + (3.098 * heightInCm) - (4.330 * age)
    }
    if (user.goal == 'weightLoss') {
        maxCalorieIntake = BMR - 500;
    }
    else if (user.goal == 'weightGain') {
        maxCalorieIntake = BMR + 500;
    }
    else {
        maxCalorieIntake = BMR;
    }

    res.json(createResponse(true, 'max calorie intake', { maxCalorieIntake }));

})

function filterEntriesByDate(entries, targetDate) {
    return entries.filter(entry => {
        const entryDate = new Date(entry.date);
        return (
            entryDate.getDate() === targetDate.getDate() &&
            entryDate.getMonth() === targetDate.getMonth() &&
            entryDate.getFullYear() === targetDate.getFullYear()
        );
    });
}
module.exports = router;