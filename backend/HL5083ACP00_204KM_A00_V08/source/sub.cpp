#include "stdafx.h"
#include "Test_Method.h"
#include "EEPROM_Interface.h"
#include "sub.h"
#include <iostream>
#include <fstream>
#include <string>


extern float pat_delay;
extern Test_Method test_method;
extern EEPROM_Interface eeprom;
extern bool DEBUG;
extern double sts_result[SITE_NUM];
extern int Reg_Rd[SITE_NUM];
extern I2C_Class I2C;
extern MyGetResult_Test MyGetResult;
void creat_data(double *pat, int &samples, double step, double start1, double stop1, double start2, double stop2, double start3, double stop3, double start4, double stop4,
	double start5, double stop5, double start6, double stop6, double start7, double stop7, double start8, double stop8, double start9, double stop9,
	double start10, double stop10, double start11, double stop11, double start12, double stop12)
{
	int samples1 = 0, samples2 = 0, samples3 = 0, samples4 = 0, samples5 = 0, samples6 = 0, samples7 = 0, samples8 = 0, samples9 = 0, samples10 = 0, samples11 = 0, samples12 = 0;
	if (start1 != 9999.9)
	{
		samples1 = int(fabs((start1 - stop1) / step));
		samples = samples1;
		STSAWGCreateRampData(&pat[0], samples1, 1, start1, stop1);
	}
	if (start2 != 9999.9)
	{
		samples2 = int(fabs((start2 - stop2) / step));
		samples = samples1 + samples2;
		STSAWGCreateRampData(&pat[samples - samples2], samples2, 1, start2, stop2);
	}
	if (start3 != 9999.9)
	{
		samples3 = int(fabs((start3 - stop3) / step));
		samples = samples1 + samples2 + samples3;
		STSAWGCreateRampData(&pat[samples - samples3], samples3, 1, start3, stop3);
	}
	if (start4 != 9999.9)
	{
		samples4 = int(fabs((start4 - stop4) / step));
		samples = samples1 + samples2 + samples3 + samples4;
		STSAWGCreateRampData(&pat[samples - samples4], samples4, 1, start4, stop4);
	}
	if (start5 != 9999.9)
	{
		samples5 = int(fabs((start5 - stop5) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5;
		STSAWGCreateRampData(&pat[samples - samples5], samples5, 1, start5, stop5);
	}
	if (start6 != 9999.9)
	{
		samples6 = int(fabs((start6 - stop6) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6;
		STSAWGCreateRampData(&pat[samples - samples6], samples6, 1, start6, stop6);
	}
	if (start7 != 9999.9)
	{
		samples7 = int(fabs((start7 - stop7) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6 + samples7;
		STSAWGCreateRampData(&pat[samples - samples7], samples7, 1, start7, stop7);
	}
	if (start8 != 9999.9)
	{
		samples8 = int(fabs((start8 - stop8) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6 + samples7 + samples8;
		STSAWGCreateRampData(&pat[samples - samples8], samples8, 1, start8, stop8);
	}
	if (start9 != 9999.9)
	{
		samples9 = int(fabs((start9 - stop9) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6 + samples7 + samples8 + samples9;
		STSAWGCreateRampData(&pat[samples - samples9], samples9, 1, start9, stop9);
	}
	if (start10 != 9999.9)
	{
		samples10 = int(fabs((start10 - stop10) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6 + samples7 + samples8 + samples9 + samples10;
		STSAWGCreateRampData(&pat[samples - samples10], samples10, 1, start10, stop10);
	}
	if (start11 != 9999.9)
	{
		samples11 = int(fabs((start11 - stop11) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6 + samples7 + samples8 + samples9 + samples10 + samples11;
		STSAWGCreateRampData(&pat[samples - samples11], samples11, 1, start11, stop11);
	}
	if (start12 != 9999.9)
	{
		samples12 = int(fabs((start12 - stop12) / step));
		samples = samples1 + samples2 + samples3 + samples4 + samples5 + samples6 + samples7 + samples8 + samples9 + samples10 + samples11 + samples12;
		STSAWGCreateRampData(&pat[samples - samples12], samples12, 1, start12, stop12);
	}
}

void FV_SAMETIME(FOVI vi_ramp1, FOVI vi_ramp2, FOVI vi_ramp3, FOVI_VRNG v_range, FOVI_IRNG i_range, double step, double start, double stop)
{
	double pat[2000] = { 0.0 };
	int samples = 0;
	int interval = 200;
	samples = int(fabs((start - stop) / step));
	STSAWGCreateRampData(&pat[0], samples, 1, start, stop);
	vi_ramp1.Set(FV, pat[0], v_range, i_range, RELAY_ON);
	vi_ramp2.Set(FV, pat[0], v_range, i_range, RELAY_ON);
	vi_ramp3.Set(FV, pat[0], v_range, i_range, RELAY_ON);
	vi_ramp1.AwgClear();
	vi_ramp2.AwgClear();
	vi_ramp3.AwgClear();
	vi_ramp1.AwgLoader("awg1", FV, v_range, i_range, pat, samples);
	vi_ramp2.AwgLoader("awg2", FV, v_range, i_range, pat, samples);
	vi_ramp3.AwgLoader("awg3", FV, v_range, i_range, pat, samples);
	vi_ramp1.AwgSelect("awg1", 0, samples - 1, samples - 1, interval);
	vi_ramp2.AwgSelect("awg2", 0, samples - 1, samples - 1, interval);
	vi_ramp3.AwgSelect("awg3", 0, samples - 1, samples - 1, interval);
	vi_ramp1.MeasureVI(samples, interval, MEAS_AWG);
	vi_ramp2.MeasureVI(samples, interval, MEAS_AWG);
	vi_ramp3.MeasureVI(samples, interval, MEAS_AWG);
	STSEnableAWG(&vi_ramp1, &vi_ramp2, &vi_ramp3);
	STSEnableMeas(&vi_ramp1, &vi_ramp2, &vi_ramp3);
	STSAWGRun();
}

void ramp(FOVI vi_ramp, FOVI_VRNG v_range, FOVI_IRNG i_range, int interval, FOVI vi_cap, std::map<int, map<int, double>> &result,
	double step, double start1, double stop1, double start2, double stop2, double start3, double stop3, double start4, double stop4,
	double start5, double stop5, double start6, double stop6, double start7, double stop7, double start8, double stop8, double start9, double stop9,
	double start10, double stop10, double start11, double stop11, double start12, double stop12)
{
	double pat[2000] = { 0.0 };
	int samples = 0;
	creat_data(pat, samples, step, start1, stop1, start2, stop2, start3, stop3, start4, stop4,
		start5, stop5, start6, stop6, start7, stop7, start8, stop8, start9, stop9,
		start10, stop10, start11, stop11, start12, stop12);

	vi_ramp.Set(FV, pat[0], v_range, i_range, RELAY_ON, 1);
	vi_ramp.Set(FV, pat[0], v_range, i_range, RELAY_ON);
	vi_ramp.AwgClear();
	vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
	vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
	vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
	vi_cap.MeasureVI(samples, interval, MEAS_AWG);
	STSEnableAWG(&vi_ramp);
	STSEnableMeas(&vi_cap, &vi_ramp);
	STSAWGRun();

	double STAT_DATA[SITE_NUM][2000] = { 0.0 };
	SERIAL vi_cap.BlockRead(SITE, 0, samples, STAT_DATA[SITE], MVRET);
	int TRIG_POINT[SITE_NUM][12] = { 0 };
	SERIAL
	{
		//////////////////////////////起始是低电平////////////////////////////////////////
		if (STAT_DATA[SITE][0] < 2)
		{
			for (int i = 0; i < samples; i++)
			{
				if (STAT_DATA[SITE][i] > 2)
				{
					TRIG_POINT[SITE][0] = i;
					break;
				}
			}
			if (TRIG_POINT[SITE][0])
			{
				for (int i = TRIG_POINT[SITE][0] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][1] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][1])
			{
				for (int i = TRIG_POINT[SITE][1] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][2] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][2])
			{
				for (int i = TRIG_POINT[SITE][2] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][3] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][3])
			{
				for (int i = TRIG_POINT[SITE][3] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][4] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][4])
			{
				for (int i = TRIG_POINT[SITE][4] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][5] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][5])
			{
				for (int i = TRIG_POINT[SITE][5] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][6] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][6])
			{
				for (int i = TRIG_POINT[SITE][6] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][7] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][7])
			{
				for (int i = TRIG_POINT[SITE][7] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][8] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][8])
			{
				for (int i = TRIG_POINT[SITE][8] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][9] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][9])
			{
				for (int i = TRIG_POINT[SITE][9] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][10] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][10])
			{
				for (int i = TRIG_POINT[SITE][10] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][11] = i;
						break;
					}
				}
			}
		}
		//////////////////////////////起始是高电平////////////////////////////////////////
		else if (STAT_DATA[SITE][0] > 2)
		{
			for (int i = 0; i < samples; i++)
			{
				if (STAT_DATA[SITE][i] < 2)
				{
					TRIG_POINT[SITE][0] = i;
					break;
				}
			}
			if (TRIG_POINT[SITE][0])
			{
				for (int i = TRIG_POINT[SITE][0] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][1] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][1])
			{
				for (int i = TRIG_POINT[SITE][1] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][2] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][2])
			{
				for (int i = TRIG_POINT[SITE][2] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][3] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][3])
			{
				for (int i = TRIG_POINT[SITE][3] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][4] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][4])
			{
				for (int i = TRIG_POINT[SITE][4] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][5] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][5])
			{
				for (int i = TRIG_POINT[SITE][5] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][6] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][6])
			{
				for (int i = TRIG_POINT[SITE][6] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][7] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][7])
			{
				for (int i = TRIG_POINT[SITE][7] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][8] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][8])
			{
				for (int i = TRIG_POINT[SITE][8] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][9] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][9])
			{
				for (int i = TRIG_POINT[SITE][9] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] < 2)
					{
						TRIG_POINT[SITE][10] = i;
						break;
					}
				}
			}
			if (TRIG_POINT[SITE][10])
			{
				for (int i = TRIG_POINT[SITE][10] + 2; i < samples; i++)
				{
					if (STAT_DATA[SITE][i] > 2)
					{
						TRIG_POINT[SITE][11] = i;
						break;
					}
				}
			}
		}
	}
		SERIAL
	{
		for (int i = 0; i < 12; i++)
		{
			if (TRIG_POINT[SITE][i])
			{
				result[SITE][i] = vi_ramp.GetMeasResult(SITE, MVRET, (TRIG_POINT[SITE][i] - 1));
			}
			else
			{
				result[SITE][i] = 9999;
			}
		}
	}
}







void measure_FSW(TRIM_NODE *trim_node, TREG_MEASURE_FLAG treg_measure_flag, double *results){
	eeprom.EEPROM_Preview("EEPROM3", 0x58, 0x80);
	delay_ms(1);
	qtmu0.MeasFreq(QTMU_PLUS_COARSE, QTMU_PLUS_TRNG_US, 10, 1);
	SERIAL results[SITE] = qtmu0.GetMeasureResult(SITE);
}






void DIO_Scan_Init(float Period, float VIH, float VIL, float VOH, float VOL)
{
	/*Period=10e-6;*/
	dio.Init();
	dio.Connect();
	//delay_ms(1);
	dio.SetVIH(VIH);
	dio.SetVIL(VIL);
	dio.SetVOH(VOH);
	dio.SetVOL(VOL);
	dio.SetClockPeriod(Period);
	dio.SetWaveFormat(1, "RTZ");
	dio.SetWaveFormat(5, "RTZ");
	dio.SetWaveFormat(2, "NRZ");
	dio.SetWaveFormat(3, "NRZ");
	dio.SetWaveFormat(6, "NRZ");
	dio.SetWaveFormat(7, "NRZ");
	dio.SetDelay(1, (float)(Period*0.45), (float)(Period*0.85), (float)(Period*0.4));
	dio.SetDelay(5, (float)(Period*0.45), (float)(Period*0.85), (float)(Period*0.4));
	dio.SetDelay(2, (float)(Period*0.1), Period, (float)(Period*0.4));
	dio.SetDelay(3, (float)(Period*0.1), Period, (float)(Period*0.4));
	dio.SetDelay(6, (float)(Period*0.1), Period, (float)(Period*0.4));
	dio.SetDelay(7, (float)(Period*0.1), Period, (float)(Period*0.4));	
}




void I2Cread(int I2CREG, double  *readvale)
{
	dio.I2CReadData(I2C_DEVICE_ADDR, I2CREG, 1);
	SERIAL  readvale[SITE] = dio.I2CGetReadData(SITE, 1);

}




void OTP_Preview_Byte(BYTE SlaveAddress, BYTE RegAddress, const char* reg_str)
{

	dio.I2CWriteData(SlaveAddress, RegAddress, (WORD)(dut.assy(reg_str).get_working(0)), (WORD)(dut.assy(reg_str).get_working(1)));
}

//void OTP_Preview_Byte(BYTE SlaveAddress, BYTE RegAddress1, const char* reg_str1, BYTE RegAddress2, const char* reg_str2 )
//{
//
////	dio.I2CWriteData(SlaveAddress, RegAddress1 , (WORD)(dut.assy(reg_str1).get_working(0)),  (WORD)(dut.assy(reg_str1).get_working(1)) ); 
////	dio.I2CWriteData(SlaveAddress, RegAddress2 , (WORD)(dut.assy(reg_str2).get_working(0)),  (WORD)(dut.assy(reg_str2).get_working(1)) ); 
//}


//void OTP_Preview_All(BYTE SlaveAddress, BYTE RegAddress, const char* reg_str)
//{
//
////	dio.I2CWriteData(SlaveAddress, RegAddress , (WORD)(dut.assy(reg_str).get_working(0)),  (WORD)(dut.assy(reg_str).get_working(1)) ); 
//}



void OTP_Preview_All(BYTE SlaveAddress)
{
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse

	dio.I2CWriteData(SlaveAddress, 0x40, (WORD)(dut.assy("OTP_0x40").get_working(0)), (WORD)(dut.assy("OTP_0x40").get_working(1))); // vbg/vref
	dio.I2CWriteData(SlaveAddress, 0x41, (WORD)(dut.assy("OTP_0x41").get_working(0)), (WORD)(dut.assy("OTP_0x41").get_working(1))); // iref/OSC
	dio.I2CWriteData(SlaveAddress, 0x42, (WORD)(dut.assy("OTP_0x42").get_working(0)), (WORD)(dut.assy("OTP_0x42").get_working(1))); // iref/OSC
	dio.I2CWriteData(SlaveAddress, 0x43, (WORD)(dut.assy("OTP_0x43").get_working(0)), (WORD)(dut.assy("OTP_0x43").get_working(1))); // SRC_ILIMIT
	dio.I2CWriteData(SlaveAddress, 0x44, (WORD)(dut.assy("OTP_0x44").get_working(0)), (WORD)(dut.assy("OTP_0x44").get_working(1))); // SRC_ILIMIT
	dio.I2CWriteData(SlaveAddress, 0x45, (WORD)(dut.assy("OTP_0x45").get_working(0)), (WORD)(dut.assy("OTP_0x45").get_working(1))); // SRC_CUR
	dio.I2CWriteData(SlaveAddress, 0x46, (WORD)(dut.assy("OTP_0x46").get_working(0)), (WORD)(dut.assy("OTP_0x46").get_working(1))); // SRC_CUR
	dio.I2CWriteData(SlaveAddress, 0x47, (WORD)(dut.assy("OTP_0x47").get_working(0)), (WORD)(dut.assy("OTP_0x47").get_working(1))); // VCON1_ILIMIT
	dio.I2CWriteData(SlaveAddress, 0x48, (WORD)(dut.assy("OTP_0x48").get_working(0)), (WORD)(dut.assy("OTP_0x48").get_working(1))); // VCON1_ILIMIT
	dio.I2CWriteData(SlaveAddress, 0x49, (WORD)(dut.assy("OTP_0x49").get_working(0)), (WORD)(dut.assy("OTP_0x49").get_working(1))); // VCON2_ILIMIT
	dio.I2CWriteData(SlaveAddress, 0x4A, (WORD)(dut.assy("OTP_0x4A").get_working(0)), (WORD)(dut.assy("OTP_0x4A").get_working(1))); // VCON2_ILIMIT
	dio.I2CWriteData(SlaveAddress, 0x4B, (WORD)(dut.assy("OTP_0x4B").get_working(0)), (WORD)(dut.assy("OTP_0x4B").get_working(1))); // VCON2_ILIMIT


	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	//add fix code here:

}


void OTP_Preview_ref(BYTE SlaveAddress)
{
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	dio.I2CWriteData(SlaveAddress, 0x40, (WORD)(dut.assy("OTP_0x40").get_working(0)), (WORD)(dut.assy("OTP_0x40").get_working(1))); // vbg/vref
}

void OTP_Preview_iref(BYTE SlaveAddress)
{
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	dio.I2CWriteData(SlaveAddress, 0x40, (WORD)(dut.assy("OTP_0x40").get_working(0)), (WORD)(dut.assy("OTP_0x40").get_working(1))); // vbg/vref
	dio.I2CWriteData(SlaveAddress, 0x41, (WORD)(dut.assy("OTP_0x41").get_working(0)), (WORD)(dut.assy("OTP_0x41").get_working(1))); // iref/OSC
}



void MyCbitOn( short relay_S1, short relay_S2,... )
{                                                  
    va_list marker;
    va_start(marker,relay_S2);
    while(relay_S1>=0) {
	cbit.SetCBITOn((BYTE)relay_S1);
	cbit.SetCBITOn((BYTE)relay_S2);
        relay_S1=va_arg(marker,short);
        relay_S2=va_arg(marker,short);
    }
    va_end(marker);
	 delay_ms(1);

}

void MyCbitOff( short relay_S1, short relay_S2,... )
{                                                    // open I2Cqueue -> with before set adress of I2C slave adress at pattern with label "label_store"
    va_list marker;
    va_start(marker,relay_S2);
    while(relay_S1>=0) {
	cbit.SetCBITOff((BYTE)relay_S1);
	cbit.SetCBITOff((BYTE)relay_S2);
        relay_S1=va_arg(marker,short);
        relay_S2=va_arg(marker,short);
    }
    va_end(marker);
     delay_ms(1);
}


void clearTimeCsv() {
	std::ofstream file("time.csv", std::ios::out | std::ios::trunc);
	if (file.is_open()) {
		file << "test_name,time\n";  // 重新写入表头
		file.close();
		std::cout << "文件已清空" << std::endl;
	}
	else {
		std::cerr << "无法清空文件 time.csv" << std::endl;
	}
}

// 写入函数（正常模式自动追加）
void writeToTimeCsv(const std::string& testName, double start_time) {
	// 判断文件是否存在，第一次调用时自动清空


	double end_time = STSGetTimeElapsed(0);

	std::ifstream checkFile("time.csv");
	bool isFirstCall = !checkFile.good();
	checkFile.close();

	std::ofstream file;
	if (isFirstCall) {
		file.open("time.csv", std::ios::out | std::ios::trunc);
		if (file.is_open()) {
			file << "test_name, time\n";  // 写入表头
		}
	}
	else {
		file.open("time.csv", std::ios::out | std::ios::app);
	}

	if (file.is_open()) {
		file << testName << "," << (end_time - start_time) << std::endl;
		file.close();
	}
	else {
		std::cerr << "无法打开文件 time.csv" << std::endl;
	}
}
