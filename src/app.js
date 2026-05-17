import express from 'express'
import mongoose from 'mongoose';
import dotenv from 'dotenv';



const app = express();


dotenv.config();

// MiddleWare  
app.use(express.json());

// Kết nối đến MongoDB
mongoose.connect(process.env.MONGODB_URL).
then(() => {
    console.log("Kết nối thành công đến MongoDB");
}).catch((error) => {
    console.error("Lỗi kết nối đến MongoDB:", error);
});


app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.post('/', (req, res) => {
    const {name,email,password} = req.body;
    console.log({name,email,password});
    res.status(201).send(
        {
            status: "Success",
            message: "Tài khoản tạo thành công",
            // data: {name,email,password}
        }
    );
});

app.put('/:id', (req, res) => {
    const {id} = req.params;
    console.log("ID nguoi dung ", id);
    if (!id) {
        return res.status(400).send({
            status: "Error",
            message: "ID is required",
        });

    } else if (isNaN(id)) {
        return res.status(400).send({
            status: "Error",
            message: "Invalid ID",
        });
    }



    const{password} = req.body;
    console.log(password);
    res.status(200).send({
        status: "Success",
        message: "Data updated successfully",
    });
});
app.delete('/:id', (req, res) => {
    const {id} = req.params;
    console.log("ID nguoi dung ", id);
    if (!id) {
        return res.status(400).send({
            status: "Error",
            message: "ID is required",
        });

    } else if (isNaN(id)) {
        return res.status(400).send({
            status: "Error",
            message: "Invalid ID",
        });
    }
    res.status(200).send({
        status: "Success",
        message: "Data Delete successfully",
    });
});



app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

//Minh có tất gồm những phương thức RestFullAPI như sau:
//GET: Lấy dữ liệu từ server
//POST: Gửi dữ liệu mới đến server
//PUT: Cập nhật dữ liệu hiện có trên server
//DELETE: Xóa dữ liệu khỏi server
//Rest =  Representational State Transfer, là một kiến trúc phần mềm cho các hệ thống phân tán như web services. Nó sử dụng các phương thức HTTP để thực hiện các thao tác trên tài nguyên, giúp tạo ra các API dễ hiểu và dễ sử dụng.

//4 nguyên tắc cần nhớ RestFullAPI:
//1. Resoures-Based: Tài nguyên được xác định bằng URL và được thao tác thông qua các phương thức HTTP.
// -API xoay quanh các tài nguyên .
// Resource là danh từ  chỉ đối tượng hoặc dữ liệu mà API quản lý, ví dụ: /users, /products, /orders. 
// HTTP Methods (GET, POST, PUT, DELETE) được sử dụng để thao tác với các tài nguyên này.
// 3. Stateless (Trạng thái ): Mỗi yêu cầu từ client đến server phải chứa tất cả thông tin cần thiết để hiểu và xử lý yêu cầu đó. Server không lưu trữ trạng thái của client giữa các yêu cầu.
// -Mỗi yêu cầu từ client đến server phải chứa tất cả thông tin cần thiết để hiểu và xử lý yêu cầu đó. Server không lưu trữ trạng thái của client giữa các yêu cầu.
// -Điều này giúp tăng tính mở rộng và đơn giản hóa thiết kế của API, vì server không cần phải quản lý trạng thái của client.
// 4. Chuẩn response: 
//- Status code: Sử dụng mã trạng thái HTTP để phản hồi kết quả của yêu cầu (ví dụ: 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 403 Forbidden, 500 Internal Server Error). 
// - Message : "Success", "Error", "Not Found", "Forbidden", "Internal Server Error".
// - Data: Dữ liệu trả về từ server (nếu có), thường ở định dạng JSON.