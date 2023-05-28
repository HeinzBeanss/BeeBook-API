const { body, validationResult } = require("express-validator");
const async = require("async");
const bcrypt = require("bcryptjs");
const { DateTime } = require('luxon');
const multer = require("multer");
const upload = multer({
    limits: {
      fileSize: 4 * 1024 * 1024, // 1MB in bytes
    },
    fileFilter: function (req, file, cb) {
        // Check the file type
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/gif' || file.mimetype === 'image/tiff' || file.mimetype === 'image/webp' ) {
          // Accept the file
          cb(null, true);
        } else {
          // Reject the file
          cb(new Error('Invalid file type.'));
        }
      },
  });

// Models
const User = require("../models/user");
const Post = require("../models/post");
const Comment = require("../models/comment");

// Get all Users that aren't friends with he current user - COMPLETE
exports.get_user_list_not_friends = async (req, res, next) => {
    try {
        const currentUser = await User.findById(req.params.id)
        .populate("friends");
        const friendList = currentUser.friends.map(friend => friend._id);

        const users = await User.find({
            $and: [
                { _id: { $nin: [req.params.id, ...friendList] } },
            ]
        })
        .select("first_name last_name profile_picture friends friend_requests_in friend_requests_out _id")
        .lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'An error occurred' });
    }
};

// Get specific User
exports.get_user = async (req, res, next) => {
    try {   
        const user = await User.findById(req.params.id)
        .select("first_name last_name bio birthdate profile_picture banner friends posts date_created")
        .populate("friends")
        .populate({
          path: "posts",
          options: {
            limit: 15,
            sort: { timestamp: -1 }, // Sort by timestamp in descending order
          },
          populate: [
            {
              path: "author",
              model: "User",
              select: "first_name last_name profile_picture", // Select the desired fields from the author
            },
            {
              path: "comments",
              model: "Comment",
              populate: {
                path: "author",
                model: "User",
                select: "first_name last_name profile_picture", // Select the desired fields from the author of the comment
              },
            },
          ],
        })
        .lean();
      
        // Note - Maybe populate fields.
        res.json(user)
    } catch (err) {
        res.status(500).json({ error: "An error has occured" });
    }
};

// Create new user - COMPLETE
exports.post_user = [
    body("first_name", "You must enter your first name").trim().notEmpty(),
    body("last_name", "You must enter your last name").trim().notEmpty(),
    body("email", "Invalid email address").trim().notEmpty().isEmail(),
    body("password", "Must be 6 at least characters").trim().isLength({min: 6}),
    body("passwordtwo").custom((value, {req}) => {
        if (value !== req.body.password) {
            console.log(value);
            console.log(req.body.password);
            throw new Error("Passwords do not match");
        }
        return true;
    }),
    body("birthdate", "You must enter your birthdate").notEmpty(),
    body("birthdate", "Invalid date of birth")
    .isISO8601()
    .toDate(),
    async (req, res, next) =>  {
        console.log(req.body.birthdate);
        if (req.body.birthdate instanceof Date) {
            console.log('birthdate is a Date object');
        }
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({errors: errors.array()});
        }
        // Make sure to hash the password e.g bycrypt.hash
        bcrypt.hash(req.body.password, 10, async (err, hashedPassword) => {
            if (err) {
                return next(err)
            }
            // Store hashedPassword in DB
            try {
                console.log("GENERATING USER")
                const user = new User({
                    // User Details
                    first_name: req.body.first_name,
                    last_name: req.body.last_name,
                    email: req.body.email,
                    password: hashedPassword,
                    birthdate: req.body.birthdate,

                    // User Friends
                    friends: [],
                    friend_requests_in: [],
                    friend_requests_out: [],

                    // User Content
                    posts: [],
                    liked_posts: [],
                    liked_comments: [],
                });

                const result = await user.save();
                return res.json({ message: result });

            } catch(err) {
                return next(err);
            };
        });
    }
]

// Edit a user profile
exports.edit_user = [
    (req, res, next) => {
        res.json({ message: "edit user"});
    }
];

// Edit a user banner 
exports.edit_user_banner = [
    (req, res, next) => {
        upload.single('image')(req, res, function (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: 'File size exceeds the limit of 4MB.' });
            }
            return res.status(500).json({ error: 'File upload error.' });
          } else if (err) {
            return res.status(500).json({ error: 'File upload error.' });
          }
          next();
        });
      },
    async (req, res, next) => {
        if (!req.file) {
             return res.status(500).json({ message: "No banner upload found" });
        } else {
            try {
                const user = await User.findById(req.params.id);
                if (!user) {
                    return res.status(404).json({ error: 'User not found' });
                }
                user.banner.data = req.file.buffer;
                user.banner.contentType = req.file.mimetype;
                await user.save();
                res.json({ message: "Successfully updated user's banner" });
            } catch (err) {
                return res.status(500).json({ message: "There was an error upading the user's banner" });
            }
        }
    }
];

// Get a list of friends - COMPLETE
exports.get_friends = async (req, res,  next) => {
    try {
        const user = await User.findById(req.params.id)
        .select("friends")
        .populate("friends")
        .lean();

        if (!user) {
            return res.status(404).json({ error: "No user found"})
        } 
        res.json(user.friends);
    } catch (err) {
        res.status(500).json({ error: "An error has occured" });
    }
}

// Get a list of friend requests  - COMPLETE
exports.get_friend_requests = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id)
        .select("friend_requests_in")
        .populate({
            path: "friend_requests_in",
            select: "first_name last_name profile_picture friends"
        })
        .lean();

        if (!user) {
            return res.status(404).json({ error: "No user found"});
        }
        res.json(user.friend_requests_in);
    } catch (err) {
        res.status(500).json({ error: "An error occured" });
    }
}

// Send a friend request - COMPLETE
exports.send_friend_request = async (req, res, next) => {
    try {
        const currentUser = await User.findById(req.params.id);
        const targetUser = await User.findById(req.params.targetUserId);
    
        const isFriend = currentUser.friends.includes(req.params.targetUserId);
        const isRequestSent = currentUser.friend_requests_out.includes(req.params.targetUserId);
    
        if (isFriend || isRequestSent) {
            return res.status(400).json({ error: "Friend request already sent or user is already a friend" });
        }
        
        currentUser.friend_requests_out.push(req.params.targetUserId);
        targetUser.friend_requests_in.push(req.params.id);
    
        await Promise.all([ currentUser.save(), targetUser.save()]);

        res.json({ message: `Sucessfully ${currentUser.first_name} added ${targetUser.first_name}` });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "An error occurred while sending the friend request" });
    }
};

// Accept a friend request - COMPLETE
exports.add_friend = async (req, res, next) => {
    try {
        const currentUser = await User.findById(req.params.id)
        .populate("friend_requests_in friends");
        const targetUser = await User.findById(req.params.targetUserId)
        .populate("friend_requests_out friends");

        currentUser.friend_requests_in.pull(targetUser._id);
        targetUser.friend_requests_out.pull(currentUser._id);
        currentUser.friends.push(targetUser._id);
        targetUser.friends.push(currentUser._id);

        await Promise.all([ currentUser.save(), targetUser.save()]);

        res.json({ message: ` ${currentUser.first_name} accepted ${targetUser.first_name}'s friend request` });

    } catch (err) {
        res.status(500).json({ error: "An error has occured" });
    }
};

// Resind a friend reqest - COMPLETE
exports.resind_friend_request = async (req, res, next) => {
    try {
        const currentUser = await User.findById(req.params.id)
        .populate("friend_requests_out");
        const targetUser = await User.findById(req.params.targetUserId)
        .populate("friend_requests_in");

        currentUser.friend_requests_out.pull(targetUser._id);
        targetUser.friend_requests_in.pull(currentUser._id);

        await Promise.all([ currentUser.save(), targetUser.save()]);

        res.json({ message: ` ${currentUser.first_name} rescinded ${targetUser.first_name}'s friend request` });

    } catch (err) {
        res.status(500).json({ error: "An error has occured while attempting to rescind the friend request" });
    }
};

// Deny a friend request - COMPLETE
exports.deny_friend_request = async (req, res, next) => {
    try {
        const currentUser = await User.findById(req.params.id)
        .populate("friend_requests_in");
        const targetUser = await User.findById(req.params.targetUserId)
        .populate("friend_requests_out");

        currentUser.friend_requests_in.pull(targetUser._id);
        targetUser.friend_requests_out.pull(currentUser._id);

        await Promise.all([ currentUser.save(), targetUser.save()]);

        res.json({ message: ` ${currentUser.first_name} denied ${targetUser.first_name}'s friend request` });
    } catch (err) {
        res.status(500).json({ error: "An error occurred while denying the friend request" });
    }
};

// Remove a friend
exports.remove_friend = (req, res, next) => {
    res.json({ message: "remove friend"});
};

// Delete user
exports.delete_user = (req, res, next) => {
    res.json({ message: "delete user"});
};


